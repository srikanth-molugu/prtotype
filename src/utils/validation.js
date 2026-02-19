const { z } = require('zod');

const certificateIdParamSchema = z.object({
  certificateId: z.string().regex(/^SOP-\d{4}-[A-Z_]+-\d{6}$/)
});

const issueCertificateSchema = z.object({
  user: z.object({
    id: z.string().optional(),
    name: z.string().min(2),
    email: z.string().email()
  }),
  context: z.object({
    eventType: z.string().min(2),
    eventName: z.string().optional(),
    score: z.number().min(0).max(100).optional(),
    eventStartDate: z.string().optional(),
    eventEndDate: z.string().optional(),
    college: z.string().optional(),
    cohort: z.string().optional()
  }),
  templateCode: z.string().optional()
});

const rowSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  eventType: z.string().min(2),
  score: z.number().min(0).max(100).nullable().optional(),
  templateCode: z.string().optional(),
  eventName: z.string().optional(),
  eventStartDate: z.string().optional(),
  eventEndDate: z.string().optional(),
  college: z.string().optional(),
  cohort: z.string().optional()
});

module.exports = {
  certificateIdParamSchema,
  issueCertificateSchema,
  rowSchema
};
