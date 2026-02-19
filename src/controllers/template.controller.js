const { listTemplates } = require('../services/template.service');

async function listTemplatesHandler(req, res, next) {
  try {
    const templates = await listTemplates();
    res.json(templates);
  } catch (error) {
    next(error);
  }
}

module.exports = { listTemplatesHandler };
