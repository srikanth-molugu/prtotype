const express = require('express');
const certificateRoutes = require('./routes/certificate.routes');
const batchRoutes = require('./routes/batch.routes');
const templateRoutes = require('./routes/template.routes');
const { errorHandler } = require('./middleware/error.middleware');

const app = express();

app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/certificates', certificateRoutes);
app.use('/batch', batchRoutes);
app.use('/templates', templateRoutes);

app.use(errorHandler);

module.exports = { app };
