const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { env } = require('../config/env');

const s3 = new S3Client({
  region: env.s3.region,
  endpoint: env.s3.endpoint,
  forcePathStyle: env.s3.forcePathStyle,
  credentials: {
    accessKeyId: env.s3.accessKeyId,
    secretAccessKey: env.s3.secretAccessKey
  }
});

async function uploadPdf(buffer, key) {
  const command = new PutObjectCommand({
    Bucket: env.s3.bucket,
    Key: key,
    Body: buffer,
    ContentType: 'application/pdf'
  });

  await s3.send(command);
  return `${env.s3.endpoint.replace(/\/$/, '')}/${env.s3.bucket}/${key}`;
}

module.exports = { uploadPdf };
