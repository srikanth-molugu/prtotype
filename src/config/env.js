const dotenv = require('dotenv');

dotenv.config();

const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  adminApiKey: process.env.ADMIN_API_KEY,
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:4000',
  s3: {
    region: process.env.S3_REGION,
    bucket: process.env.S3_BUCKET,
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true'
  },
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379'
};

module.exports = { env };
