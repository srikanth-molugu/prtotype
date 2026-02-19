const { prisma } = require('../config/prisma');

async function generateCertificateId(templateCode, tx) {
  const year = new Date().getUTCFullYear();

  const sequence = await tx.certificateSequence.upsert({
    where: {
      year_templateCode: {
        year,
        templateCode
      }
    },
    create: {
      year,
      templateCode,
      currentValue: 1
    },
    update: {
      currentValue: {
        increment: 1
      }
    }
  });

  const seq = String(sequence.currentValue).padStart(6, '0');
  return `SOP-${year}-${templateCode}-${seq}`;
}

async function generateCertificateIdAtomic(templateCode) {
  return prisma.$transaction((tx) => generateCertificateId(templateCode, tx));
}

module.exports = { generateCertificateId, generateCertificateIdAtomic };
