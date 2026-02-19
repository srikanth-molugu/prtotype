const { prisma } = require('../config/prisma');
const { httpError } = require('../utils/httpError');

async function listTemplates() {
  return prisma.template.findMany({ orderBy: { templateCode: 'asc' } });
}

async function getActiveTemplateByCode(templateCode) {
  const template = await prisma.template.findUnique({ where: { templateCode } });
  if (!template || !template.isActive) {
    throw httpError(400, 'INVALID_TEMPLATE', `Template '${templateCode}' is missing or inactive`);
  }
  return template;
}

async function chooseTemplateCode({ eventType, score, optionalTemplateCode }) {
  if (optionalTemplateCode) {
    await getActiveTemplateByCode(optionalTemplateCode);
    return optionalTemplateCode;
  }

  const normalizedEvent = String(eventType || '').trim().toUpperCase();

  if (normalizedEvent === 'WEBINAR') {
    return 'PARTICIPATION';
  }

  if (normalizedEvent === 'INTERNSHIP') {
    return 'INTERNSHIP';
  }

  const rules = await prisma.templateRule.findMany({
    where: { eventType: normalizedEvent },
    include: { template: true },
    orderBy: [{ priority: 'asc' }, { minScore: 'desc' }]
  });

  for (const rule of rules) {
    if (!rule.template.isActive) {
      continue;
    }

    const min = rule.minScore ?? Number.NEGATIVE_INFINITY;
    const max = rule.maxScore ?? Number.POSITIVE_INFINITY;
    const value = typeof score === 'number' ? score : Number.NEGATIVE_INFINITY;

    if (value >= min && value <= max) {
      return rule.template.templateCode;
    }
  }

  return 'PARTICIPATION';
}

module.exports = {
  listTemplates,
  getActiveTemplateByCode,
  chooseTemplateCode
};
