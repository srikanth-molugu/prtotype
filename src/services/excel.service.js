const xlsx = require('xlsx');
const { rowSchema } = require('../utils/validation');

function normalizeRow(rawRow) {
  const toStringTrim = (value) => (value === null || value === undefined ? '' : String(value).trim());
  const scoreValue = rawRow.score === '' || rawRow.score === undefined ? null : Number(rawRow.score);

  return {
    name: toStringTrim(rawRow.name),
    email: toStringTrim(rawRow.email).toLowerCase(),
    eventType: toStringTrim(rawRow.eventType).toUpperCase(),
    score: Number.isNaN(scoreValue) ? null : scoreValue,
    templateCode: toStringTrim(rawRow.templateCode).toUpperCase() || undefined,
    eventName: toStringTrim(rawRow.eventName) || undefined,
    eventStartDate: toStringTrim(rawRow.eventStartDate) || undefined,
    eventEndDate: toStringTrim(rawRow.eventEndDate) || undefined,
    college: toStringTrim(rawRow.college) || undefined,
    cohort: toStringTrim(rawRow.cohort) || undefined
  };
}

function parseExcelBuffer(buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(firstSheet, { defval: '' });

  return rows.map((raw, index) => {
    const normalized = normalizeRow(raw);
    const result = rowSchema.safeParse(normalized);
    return {
      rowNumber: index + 2,
      raw,
      normalized,
      isValid: result.success,
      errors: result.success ? [] : result.error.issues
    };
  });
}

module.exports = { parseExcelBuffer, normalizeRow };
