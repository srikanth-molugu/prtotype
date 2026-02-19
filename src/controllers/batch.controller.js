const { uploadBatch, getBatchStatus } = require('../services/batch.service');
const { httpError } = require('../utils/httpError');

async function uploadBatchHandler(req, res, next) {
  try {
    if (!req.file) {
      throw httpError(400, 'MISSING_FILE', 'Upload a .xlsx file as multipart form-data with field name file');
    }

    const result = await uploadBatch(req.file.originalname, req.file.buffer);
    res.status(202).json({
      batchId: result.batchId,
      fileName: req.file.originalname,
      totalRows: result.totalRows,
      status: 'processing'
    });
  } catch (error) {
    next(error);
  }
}

async function getBatchStatusHandler(req, res, next) {
  try {
    const status = await getBatchStatus(req.params.batchId);
    if (!status) {
      throw httpError(404, 'BATCH_NOT_FOUND', 'Batch not found');
    }
    res.json(status);
  } catch (error) {
    next(error);
  }
}

module.exports = { uploadBatchHandler, getBatchStatusHandler };
