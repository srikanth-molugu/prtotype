const express = require('express');
const { listTemplatesHandler } = require('../controllers/template.controller');
const { requireAdminApiKey } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/', requireAdminApiKey, listTemplatesHandler);

module.exports = router;
