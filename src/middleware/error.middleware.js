function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const payload = {
    error: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'Unexpected server error'
  };

  if (err.details) {
    payload.details = err.details;
  }

  if (statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json(payload);
}

module.exports = { errorHandler };
