const { prisma } = require('../config/prisma');
const { env } = require('../config/env');
const { chooseTemplateCode, getActiveTemplateByCode } = require('./template.service');
const { generateCertificateId } = require('../utils/idGenerator');
const { generateQrDataUrl } = require('./qr.service');
const { renderCertificateHtml, htmlToPdfBuffer } = require('./pdf.service');
const { uploadPdf } = require('./storage.service');
const { httpError } = require('../utils/httpError');

async function issueSingleCertificate({
  userName,
  userEmail,
  eventType,
  score,
  templateCode,
  eventName,
  extraData,
  batchId
}) {
  const cert = await prisma.$transaction(async (tx) => {
    const selectedTemplateCode = await chooseTemplateCode({
      eventType,
      score,
      optionalTemplateCode: templateCode
    });

    const template = await getActiveTemplateByCode(selectedTemplateCode);
    const certificateId = await generateCertificateId(selectedTemplateCode, tx);
    const verifyUrl = `${env.publicBaseUrl}/certificates/verify/${certificateId}`;
    const qrCodeDataUrl = await generateQrDataUrl(verifyUrl);

    const html = await renderCertificateHtml(template.htmlTemplateName, {
      name: userName,
      email: userEmail,
      eventType,
      eventName,
      score,
      certificateId,
      verifyUrl,
      qrCodeDataUrl,
      issuedAt: new Date().toISOString().slice(0, 10),
      extraData: extraData || {}
    });

    const pdfBuffer = await htmlToPdfBuffer(html);
    const key = `certificates/${new Date().getUTCFullYear()}/${certificateId}.pdf`;
    const pdfUrl = await uploadPdf(pdfBuffer, key);

    return tx.certificate.create({
      data: {
        certificateId,
        userName,
        userEmail,
        eventType,
        eventName,
        score: score ?? null,
        templateId: template.id,
        extraData: extraData || {},
        pdfUrl,
        verifyUrl,
        batchId: batchId || null
      },
      include: {
        template: true
      }
    });
  });

  return cert;
}

async function verifyCertificate(certificateId) {
  const cert = await prisma.certificate.findUnique({
    where: { certificateId },
    include: { template: true }
  });

  if (!cert || cert.status === 'revoked') {
    throw httpError(404, 'CERTIFICATE_NOT_FOUND', 'Certificate not found or revoked');
  }

  return {
    certificateId: cert.certificateId,
    userName: cert.userName,
    eventType: cert.eventType,
    templateCode: cert.template.templateCode,
    issuedAt: cert.issuedAt,
    status: cert.status
  };
}

async function getCertificateAdmin(certificateId) {
  const cert = await prisma.certificate.findUnique({
    where: { certificateId },
    include: { template: true }
  });

  if (!cert) {
    throw httpError(404, 'CERTIFICATE_NOT_FOUND', 'Certificate not found');
  }

  return cert;
}

async function revokeCertificate(certificateId, reason) {
  const cert = await prisma.certificate.update({
    where: { certificateId },
    data: {
      status: 'revoked',
      revokedAt: new Date(),
      revokeReason: reason || null
    }
  });

  return cert;
}

module.exports = {
  issueSingleCertificate,
  verifyCertificate,
  getCertificateAdmin,
  revokeCertificate
};
