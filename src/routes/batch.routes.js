const express = require('express');
const multer = require('multer');
const { uploadBatchHandler, getBatchStatusHandler } = require('../controllers/batch.controller');
const { requireAdminApiKey } = require('../middleware/auth.middleware');

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.post('/upload', requireAdminApiKey, upload.single('file'), uploadBatchHandler);
router.get('/:batchId/status', requireAdminApiKey, getBatchStatusHandler);

module.exports = router;
