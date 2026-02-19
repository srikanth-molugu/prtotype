# Certificate Microservice (Node.js + Express + PostgreSQL + Prisma)

## 1) Context and assumptions

### Fixed technology choices
- **Runtime/Language**: Node.js (CommonJS)
- **Framework**: Express
- **Database**: PostgreSQL + Prisma ORM
- **Storage**: S3-compatible object storage (AWS S3/MinIO/etc.)
- **PDF generation**: EJS HTML templates rendered by Puppeteer to PDF
- **Excel parsing**: `xlsx`
- **QR generation**: `qrcode`
- **Async batch processing**: BullMQ + Redis

### Additional assumptions
1. Admin users call internal APIs with an API key in `x-api-key`.
2. Public users only call the verification endpoint.
3. Certificates are immutable except status (`valid` -> `revoked`).
4. PDF URLs are object storage URLs (can later be upgraded to signed URLs).
5. Batch upload is asynchronous: upload returns quickly with `batchId`, worker processes rows in background.
6. Template-specific design details are stored in HTML templates and optional `extraData` JSON.

---

## 2) High-level responsibilities and service boundaries

### Responsibilities in this microservice
1. **Template management** (internal)
2. **Excel batch ingestion and row normalization**
3. **Template selection** (optional explicit code OR event+score rules)
4. **Certificate issuance pipeline**: ID generation -> verification URL -> QR -> HTML render -> PDF -> S3 upload -> DB persist
5. **Public verification endpoint**
6. **Revocation workflow**
7. **Status tracking for batch jobs and row-level errors**

### Future-proofing hooks
- `POST /certificates/issue` already accepts JSON payload from LMS/main app.
- Storage and PDF services are isolated for easy replacement.
- Rule table allows changing scoring logic without touching issuance core.

---

## 3) Data model and schema design

Prisma schema is in `prisma/schema.prisma`.

### Entities

#### `Template`
- `templateCode` unique (e.g., `PARTICIPATION`, `MERIT`)
- maps to `htmlTemplateName`
- `isActive` for safe deactivation

#### `TemplateRule`
- rule-by-`eventType` with optional score range (`minScore`, `maxScore`)
- `priority` controls first-match logic
- references `Template`

#### `CertificateSequence`
- atomic sequence per (`year`, `templateCode`)
- supports ID pattern `SOP-<YEAR>-<TEMPLATECODE>-<NNNNNN>`

#### `Certificate`
- internal `id` UUID + public `certificateId`
- holder fields (`userName`, `userEmail`), context (`eventType`, `eventName`, `score`)
- `extraData` JSON for extensibility (`college`, `cohort`, dates, etc.)
- `pdfUrl`, `verifyUrl`, status fields, revocation fields
- linked to `Template` and optional `Batch`

#### `Batch` and `BatchRowError`
- async execution tracking
- row-level errors captured with original row JSON + error code/message

---

## 4) Excel format and parsing

### Expected columns
| Column | Required | Type | Notes |
|---|---|---|---|
| `name` | yes | string | min length 2 |
| `email` | yes | string | valid email |
| `eventType` | yes | string | normalized to uppercase |
| `score` | conditional | number | nullable, 0-100 if present |
| `templateCode` | optional | string | if present, must exist & active |
| `eventName` | optional | string | certificate display |
| `eventStartDate` | optional | string/date | stored in `extraData` |
| `eventEndDate` | optional | string/date | stored in `extraData` |
| `college` | optional | string | stored in `extraData` |
| `cohort` | optional | string | stored in `extraData` |

### Validation behavior
- **Fatal batch errors**: unreadable file / no sheet / malformed workbook.
- **Row-level errors**: invalid email, missing name, invalid score etc.; row is logged to `BatchRowError` and processing continues.

### Parsing implementation
- `xlsx` reads first sheet.
- `sheet_to_json` with `defval: ''` ensures deterministic mapping.
- each row gets `rowNumber`, `raw`, `normalized`, `isValid`, `errors`.

### Large file handling
- Current implementation queues each row in BullMQ for non-blocking HTTP.
- For very large files, recommended improvements:
  1. stream parse file from object storage,
  2. chunk enqueue (`N` rows per chunk),
  3. set worker concurrency,
  4. archive row errors to separate storage after completion.

---

## 5) Template selection logic

### Decision order
1. If row/payload `templateCode` exists -> validate template exists and active -> use it.
2. Else infer by `eventType` + `score` using `TemplateRule` table.
3. Fallback to `PARTICIPATION`.

### Rule examples seeded
- `BOOTCAMP` + score >= 90 => `EXCELLENCE`
- `BOOTCAMP` + score >= 75 => `MERIT`
- `BOOTCAMP` + score < 75 => `PARTICIPATION`
- `WEBINAR` => `PARTICIPATION`
- `INTERNSHIP` => `INTERNSHIP`

---

## 6) Certificate ID and verification URL design

### Public ID format
`SOP-<YEAR>-<TEMPLATECODE>-<SEQUENCE>`

Example: `SOP-2026-MERIT-000123`

### Atomic generation (no collisions)
- `CertificateSequence` has unique key (`year`, `templateCode`).
- In a DB transaction, `upsert` + increment sequence.
- Generated value padded to 6 digits.

### Verification URL
`<PUBLIC_BASE_URL>/certificates/verify/<certificateId>`

- encoded as QR code
- printed in PDF footer
- stored in DB (`verifyUrl`)

---

## 7) HTML -> PDF rendering and QR embedding

### Template storage
- EJS templates under `src/templates/`
- 7 templates included:
  - `participation.ejs`
  - `completion.ejs`
  - `merit.ejs`
  - `excellence.ejs`
  - `internship.ejs`
  - `appreciation.ejs`
  - `distinction.ejs`

### Rendering flow
1. Generate QR data URL with `qrcode`.
2. Render EJS HTML placeholders (`name`, `eventName`, `certificateId`, `verifyUrl`, `qrCodeDataUrl`).
3. Use Puppeteer:
   - `A4` landscape
   - print background true
   - 12mm margins
4. Upload PDF buffer to S3 key:
   `certificates/<year>/<certificateId>.pdf`

### Storage API contract in service
```js
const url = await uploadPdf(pdfBuffer, key);
```
Returns absolute URL to stored PDF object.

---

## 8) Batch processing & job handling

### Upload endpoint
`POST /batch/upload` (multipart form-data, field name: `file`)

- creates `Batch`
- parses rows
- enqueues each row as BullMQ job `issue-row`
- returns `batchId`

### Worker behavior per row
1. row validation check
2. template selection
3. certificate generation pipeline
4. persist certificate OR persist row error
5. increment counters (`processedRows`, `successCount`, `failCount`)

### Batch status endpoint
`GET /batch/:batchId/status`

Returns counts + sample row errors.

---

## 9) API contracts

## Public API

### `GET /certificates/verify/:certificateId`
**200**
```json
{
  "certificateId": "SOP-2026-MERIT-000045",
  "userName": "Riya Sharma",
  "eventType": "BOOTCAMP",
  "templateCode": "MERIT",
  "issuedAt": "2026-03-01T12:05:10.000Z",
  "status": "valid"
}
```

**404**
```json
{
  "error": "CERTIFICATE_NOT_FOUND",
  "message": "Certificate not found or revoked"
}
```

## Admin/internal APIs (require `x-api-key`)

### `GET /templates`
List all template metadata.

### `POST /batch/upload`
`multipart/form-data` with `.xlsx` file in `file` field.

**202**
```json
{
  "batchId": "53fcb22f-7770-45a3-ad0b-55cbb6b1fba1",
  "fileName": "bootcamp_participants.xlsx",
  "totalRows": 100,
  "status": "processing"
}
```

### `GET /batch/:batchId/status`
**200**
```json
{
  "id": "53fcb22f-7770-45a3-ad0b-55cbb6b1fba1",
  "fileName": "bootcamp_participants.xlsx",
  "totalRows": 100,
  "processedRows": 100,
  "successCount": 97,
  "failCount": 3,
  "status": "completed",
  "rowErrors": [
    {
      "rowNumber": 29,
      "errorCode": "ROW_VALIDATION_FAILED",
      "message": "Invalid email"
    }
  ]
}
```

### `GET /certificates/:certificateId`
Admin view with `pdfUrl`, `extraData`, template relation, etc.

### `POST /certificates/:certificateId/revoke`
Request:
```json
{ "reason": "Issued in duplicate" }
```
Response:
```json
{
  "certificateId": "SOP-2026-MERIT-000045",
  "status": "revoked",
  "revokedAt": "2026-03-12T09:15:00.000Z"
}
```

### `POST /certificates/issue` (future LMS direct issue)
Request:
```json
{
  "user": {
    "id": "usr_1001",
    "name": "Riya Sharma",
    "email": "riya@example.com"
  },
  "context": {
    "eventType": "BOOTCAMP",
    "score": 88,
    "eventName": "Advanced Node.js Bootcamp",
    "eventStartDate": "2026-02-01",
    "eventEndDate": "2026-02-21",
    "college": "SOP University",
    "cohort": "Cohort-09"
  }
}
```
Response:
```json
{
  "certificateId": "SOP-2026-MERIT-000045",
  "verifyUrl": "https://cert.example.com/certificates/verify/SOP-2026-MERIT-000045",
  "pdfUrl": "https://s3.amazonaws.com/certificates/certificates/2026/SOP-2026-MERIT-000045.pdf"
}
```

---

## 10) Security, validation, and error handling

### Security
- Public: only `GET /certificates/verify/:certificateId`
- Admin routes protected by `x-api-key` middleware.
- For production microservice architecture, replace/extend API key with JWT or mTLS between services.

### Validation
- `zod` validates:
  - path param format for `certificateId`
  - direct issue payload
  - normalized Excel row schema

### Error shape
```json
{
  "error": "INVALID_TEMPLATE",
  "message": "Template 'MERIT' is missing or inactive",
  "details": []
}
```

HTTP semantics:
- `400` invalid input
- `401` auth failure
- `404` missing cert/batch
- `500` unexpected server failures

---

## 11) Folder structure and setup

```txt
prtotype/
  prisma/
    schema.prisma
    seed.js
  src/
    app.js
    server.js
    config/
      env.js
      prisma.js
    controllers/
      batch.controller.js
      certificate.controller.js
      template.controller.js
    middleware/
      auth.middleware.js
      error.middleware.js
    routes/
      batch.routes.js
      certificate.routes.js
      template.routes.js
    services/
      batch.service.js
      certificate.service.js
      excel.service.js
      pdf.service.js
      qr.service.js
      storage.service.js
      template.service.js
    templates/
      participation.ejs
      completion.ejs
      merit.ejs
      excellence.ejs
      internship.ejs
      appreciation.ejs
      distinction.ejs
    utils/
      httpError.js
      idGenerator.js
      validation.js
  .env.example
  package.json
```

### Bootstrapping
1. `npm install`
2. Copy `.env.example` -> `.env`
3. Provision PostgreSQL + Redis + S3-compatible bucket
4. `npx prisma generate`
5. `npx prisma migrate dev --name init`
6. `node prisma/seed.js`
7. `npm run dev`

---

## 12) End-to-end worked example

### Input scenario
Admin uploads `bootcamp_participants.xlsx` with 100 rows. One row:
- `name`: `Riya Sharma`
- `email`: `riya@example.com`
- `eventType`: `BOOTCAMP`
- `score`: `88`
- `templateCode`: blank

### Row processing outcome
1. Parse + normalize -> score `88`, eventType `BOOTCAMP`.
2. No explicit template -> rules apply -> `MERIT`.
3. Sequence generator returns next ID, e.g. `SOP-2026-MERIT-000045`.
4. Verify URL built:
   `https://cert.example.com/certificates/verify/SOP-2026-MERIT-000045`
5. QR code generated from URL.
6. EJS template rendered and converted to PDF with Puppeteer.
7. PDF uploaded to S3 path:
   `certificates/2026/SOP-2026-MERIT-000045.pdf`
8. Certificate row persisted in PostgreSQL.

### Example DB record
```json
{
  "id": "91b36f48-9d89-4f4f-8ddf-7d27f8f5a0d5",
  "certificateId": "SOP-2026-MERIT-000045",
  "userName": "Riya Sharma",
  "userEmail": "riya@example.com",
  "eventType": "BOOTCAMP",
  "eventName": "Advanced Node.js Bootcamp",
  "templateCode": "MERIT",
  "score": 88,
  "extraData": {
    "eventStartDate": "2026-02-01",
    "eventEndDate": "2026-02-21",
    "college": "SOP University",
    "cohort": "Cohort-09"
  },
  "pdfUrl": "https://s3.amazonaws.com/certificates/certificates/2026/SOP-2026-MERIT-000045.pdf",
  "verifyUrl": "https://cert.example.com/certificates/verify/SOP-2026-MERIT-000045",
  "status": "valid",
  "issuedAt": "2026-03-01T12:05:10.000Z"
}
```

### Verification response example
`GET /certificates/verify/SOP-2026-MERIT-000045`
```json
{
  "certificateId": "SOP-2026-MERIT-000045",
  "userName": "Riya Sharma",
  "eventType": "BOOTCAMP",
  "templateCode": "MERIT",
  "issuedAt": "2026-03-01T12:05:10.000Z",
  "status": "valid"
}
```

---

## Key implementation notes
- The worker currently requires Redis availability; if Redis is unavailable, batch ingestion should be degraded to sync fallback in a future patch.
- `verify` endpoint currently treats revoked as not found to avoid misuse; if business needs require explicit revoked state, return `status: revoked` with minimal public fields.
- Improve S3 URL generation for region-specific URL style or signed URL policies if bucket is private.


---

## 13) You only have this microservice: what to build next (full product roadmap)

If this is your only service today, build the platform in **phases** so you can go live quickly.

### Phase 1 (now): Certificate service only (MVP)
- Keep this service as-is.
- Use Excel upload for issuance.
- Use public verification endpoint for authenticity checks.

### Phase 2: Minimal Admin UI (recommended next)
Build a small web app (React/Next.js) that calls this service:
1. Login screen (single admin user or OAuth later).
2. Upload Excel page (`POST /batch/upload`).
3. Batch status page (`GET /batch/:batchId/status`).
4. Certificate lookup + revoke page.
5. Template list page.

This gives non-technical ops teams full control without Postman/cURL.

### Phase 3: Core LMS/Main app services
When you are ready to build “the rest”, split into these independent services:
1. **Identity/Auth Service** (users, roles, JWT tokens).
2. **Learner Service** (student profiles, cohorts, colleges).
3. **Course/Event Service** (bootcamps, webinars, internships, date windows).
4. **Assessment Service** (scores, pass/fail, ranking).
5. **Certificate Service** (this repo).
6. **Notification Service** (email/WhatsApp for certificate links).

Start with 1 + 3 + 5 first, then add 2/4/6.

### Phase 4: Event-driven integration
Replace manual Excel with automated issuance:
- LMS emits event: `learner.completed` with score/context.
- Certificate service consumes event and calls internal issuance flow.
- Notification service sends learner the `pdfUrl` + verify link.

---

## 14) Host online without managing your own server (serverless/managed)

If you don’t want to run your own VM/server, use fully managed platforms.

## Option A (fastest): Railway or Render
Good for fast go-live with minimal DevOps.

### What to provision
1. Managed PostgreSQL
2. Managed Redis
3. Object storage (Cloudflare R2 / AWS S3 / Supabase Storage)
4. One web service for this Node app

### Deployment steps
1. Push this repo to GitHub.
2. Create a new project on Railway/Render from GitHub repo.
3. Add environment variables from `.env.example`.
4. Set build/start commands:
   - Build: `npm install && npx prisma generate`
   - Start: `npm start`
5. Run migration once:
   - `npx prisma migrate deploy`
6. Run seed once:
   - `node prisma/seed.js`
7. Set `PUBLIC_BASE_URL` to your deployed HTTPS domain.

### Notes
- Keep at least 1 always-on instance, because BullMQ worker processes jobs in-process.
- If you scale to multiple instances, move worker into a separate worker service.

## Option B (more scalable): Google Cloud Run (fully managed containers)

### Architecture
- Cloud Run Service A: API server
- Cloud Run Service B: worker process (same codebase, different start command)
- Cloud SQL (Postgres)
- Memorystore (Redis)
- Cloud Storage bucket (or S3-compatible)

### Why it helps
- No server patching, autoscaling, HTTPS by default.
- Better production model for queue workers.

---

## 15) Production hardening checklist (before public launch)

1. Move from API key to JWT/m2m auth for admin/internal APIs.
2. Add rate limiting on verify endpoint.
3. Add request logging + tracing (pino + OpenTelemetry).
4. Add retry and dead-letter queue strategy for failed jobs.
5. Use private bucket + signed URLs for PDF downloads.
6. Add backup/restore policy for Postgres.
7. Add monitoring/alerts (uptime, queue lag, failures).
8. Add integration tests for:
   - Excel parsing
   - template selection
   - issuance transaction
   - verification/revoke lifecycle

---

## 16) “Do this now” concrete 1-week plan

### Day 1
- Provision Railway/Render project + Postgres + Redis + bucket.
- Configure env variables.

### Day 2
- Deploy service, run migrations + seed.
- Verify `/health` and `/templates`.

### Day 3
- Prepare a real Excel and run batch upload.
- Validate generated PDFs and verify URLs.

### Day 4
- Add basic Admin UI (upload + status + lookup).

### Day 5
- Add revoke flow in UI and basic audit logs.

### Day 6
- Configure domain name + HTTPS + monitoring.

### Day 7
- UAT with business team and go live.
