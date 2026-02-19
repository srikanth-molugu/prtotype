const { app } = require('./app');
const { env } = require('./config/env');
const { startBatchWorker } = require('./services/batch.service');

app.listen(env.port, () => {
  startBatchWorker();
  console.log(`Certificate microservice listening on port ${env.port}`);
});
