const { certificateIdParamSchema, issueCertificateSchema } = require('../utils/validation');
const {
  verifyCertificate,
  getCertificateAdmin,
  revokeCertificate,
  issueSingleCertificate
} = require('../services/certificate.service');

async function verifyCertificateHandler(req, res, next) {
  try {
    const { certificateId } = certificateIdParamSchema.parse(req.params);
    const payload = await verifyCertificate(certificateId);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function adminGetCertificateHandler(req, res, next) {
  try {
    const { certificateId } = certificateIdParamSchema.parse(req.params);
    const certificate = await getCertificateAdmin(certificateId);
    res.json(certificate);
  } catch (error) {
    next(error);
  }
}

async function revokeCertificateHandler(req, res, next) {
  try {
    const { certificateId } = certificateIdParamSchema.parse(req.params);
    const certificate = await revokeCertificate(certificateId, req.body.reason);
    res.json({
      certificateId: certificate.certificateId,
      status: certificate.status,
      revokedAt: certificate.revokedAt
    });
  } catch (error) {
    next(error);
  }
}

async function issueCertificateHandler(req, res, next) {
  try {
    const payload = issueCertificateSchema.parse(req.body);
    const cert = await issueSingleCertificate({
      userName: payload.user.name,
      userEmail: payload.user.email,
      eventType: payload.context.eventType.toUpperCase(),
      score: payload.context.score,
      templateCode: payload.templateCode,
      eventName: payload.context.eventName,
      extraData: {
        userId: payload.user.id,
        eventStartDate: payload.context.eventStartDate,
        eventEndDate: payload.context.eventEndDate,
        college: payload.context.college,
        cohort: payload.context.cohort
      }
    });

    res.status(201).json({
      certificateId: cert.certificateId,
      verifyUrl: cert.verifyUrl,
      pdfUrl: cert.pdfUrl
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  verifyCertificateHandler,
  adminGetCertificateHandler,
  revokeCertificateHandler,
  issueCertificateHandler
};
