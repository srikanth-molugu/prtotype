const express = require('express');
const {
  verifyCertificateHandler,
  adminGetCertificateHandler,
  revokeCertificateHandler,
  issueCertificateHandler
} = require('../controllers/certificate.controller');
const { requireAdminApiKey } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/verify/:certificateId', verifyCertificateHandler);
router.get('/:certificateId', requireAdminApiKey, adminGetCertificateHandler);
router.post('/:certificateId/revoke', requireAdminApiKey, revokeCertificateHandler);
router.post('/issue', requireAdminApiKey, issueCertificateHandler);

module.exports = router;
