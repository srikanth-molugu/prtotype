const { env } = require('../config/env');

function requireAdminApiKey(req, res, next) {
  const token = req.header('x-api-key');

  if (!token || token !== env.adminApiKey) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Missing or invalid x-api-key'
    });
  }

  return next();
}

module.exports = { requireAdminApiKey };
