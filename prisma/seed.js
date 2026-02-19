const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const templates = [
    ['PARTICIPATION', 'Participation Certificate', 'participation'],
    ['COMPLETION', 'Completion Certificate', 'completion'],
    ['MERIT', 'Merit Certificate', 'merit'],
    ['EXCELLENCE', 'Excellence Certificate', 'excellence'],
    ['INTERNSHIP', 'Internship Certificate', 'internship'],
    ['APPRECIATION', 'Appreciation Certificate', 'appreciation'],
    ['DISTINCTION', 'Distinction Certificate', 'distinction']
  ];

  for (const [templateCode, name, htmlTemplateName] of templates) {
    await prisma.template.upsert({
      where: { templateCode },
      update: { name, htmlTemplateName, isActive: true },
      create: {
        templateCode,
        name,
        description: `${name} for LMS credentials`,
        htmlTemplateName,
        isActive: true
      }
    });
  }

  const merit = await prisma.template.findUnique({ where: { templateCode: 'MERIT' } });
  const excellence = await prisma.template.findUnique({ where: { templateCode: 'EXCELLENCE' } });
  const participation = await prisma.template.findUnique({ where: { templateCode: 'PARTICIPATION' } });
  const internship = await prisma.template.findUnique({ where: { templateCode: 'INTERNSHIP' } });

  const rules = [
    { eventType: 'BOOTCAMP', minScore: 90, maxScore: 100, templateId: excellence.id, priority: 1 },
    { eventType: 'BOOTCAMP', minScore: 75, maxScore: 89.99, templateId: merit.id, priority: 2 },
    { eventType: 'BOOTCAMP', minScore: 0, maxScore: 74.99, templateId: participation.id, priority: 3 },
    { eventType: 'INTERNSHIP', minScore: null, maxScore: null, templateId: internship.id, priority: 1 },
    { eventType: 'WEBINAR', minScore: null, maxScore: null, templateId: participation.id, priority: 1 }
  ];

  await prisma.templateRule.deleteMany();
  await prisma.templateRule.createMany({ data: rules });

  console.log('Seed complete');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
