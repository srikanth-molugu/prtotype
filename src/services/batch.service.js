const { Queue, Worker } = require('bullmq');
const { prisma } = require('../config/prisma');
const { env } = require('../config/env');
const { parseExcelBuffer } = require('./excel.service');
const { issueSingleCertificate } = require('./certificate.service');

const connection = { connection: { url: env.redisUrl } };
const queueName = 'certificate-batch';
const batchQueue = new Queue(queueName, connection);

let workerStarted = false;

async function createBatchRecord(fileName) {
  return prisma.batch.create({
    data: {
      fileName,
      status: 'pending'
    }
  });
}

async function uploadBatch(fileName, buffer) {
  const parsedRows = parseExcelBuffer(buffer);
  const batch = await createBatchRecord(fileName);

  await prisma.batch.update({
    where: { id: batch.id },
    data: {
      totalRows: parsedRows.length,
      status: 'processing'
    }
  });

  for (const row of parsedRows) {
    await batchQueue.add('issue-row', {
      batchId: batch.id,
      row
    });
  }

  return { batchId: batch.id, totalRows: parsedRows.length };
}

function startBatchWorker() {
  if (workerStarted) {
    return;
  }

  workerStarted = true;

  const worker = new Worker(
    queueName,
    async (job) => {
      const { batchId, row } = job.data;

      if (!row.isValid) {
        await prisma.batchRowError.create({
          data: {
            batchId,
            rowNumber: row.rowNumber,
            rowData: row.raw,
            errorCode: 'ROW_VALIDATION_FAILED',
            message: JSON.stringify(row.errors)
          }
        });
        await incrementBatchCounters(batchId, false);
        return;
      }

      try {
        await issueSingleCertificate({
          userName: row.normalized.name,
          userEmail: row.normalized.email,
          eventType: row.normalized.eventType,
          score: row.normalized.score,
          templateCode: row.normalized.templateCode,
          eventName: row.normalized.eventName,
          extraData: {
            eventStartDate: row.normalized.eventStartDate,
            eventEndDate: row.normalized.eventEndDate,
            college: row.normalized.college,
            cohort: row.normalized.cohort
          },
          batchId
        });

        await incrementBatchCounters(batchId, true);
      } catch (error) {
        await prisma.batchRowError.create({
          data: {
            batchId,
            rowNumber: row.rowNumber,
            rowData: row.raw,
            errorCode: error.code || 'ROW_PROCESSING_FAILED',
            message: error.message
          }
        });
        await incrementBatchCounters(batchId, false);
      }
    },
    connection
  );

  worker.on('completed', async (job) => {
    const batchId = job.data.batchId;
    await refreshBatchStatus(batchId);
  });

  worker.on('failed', async (job, error) => {
    if (job) {
      await prisma.batch.update({
        where: { id: job.data.batchId },
        data: {
          status: 'failed',
          errorSummary: error.message
        }
      });
    }
  });
}

async function incrementBatchCounters(batchId, success) {
  await prisma.batch.update({
    where: { id: batchId },
    data: {
      processedRows: { increment: 1 },
      successCount: success ? { increment: 1 } : undefined,
      failCount: !success ? { increment: 1 } : undefined
    }
  });

  await refreshBatchStatus(batchId);
}

async function refreshBatchStatus(batchId) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) {
    return;
  }

  if (batch.processedRows >= batch.totalRows) {
    await prisma.batch.update({
      where: { id: batchId },
      data: {
        status: batch.failCount > 0 ? 'completed' : 'completed'
      }
    });
  }
}

async function getBatchStatus(batchId) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      rowErrors: {
        orderBy: { createdAt: 'asc' },
        take: 20
      }
    }
  });

  return batch;
}

module.exports = { uploadBatch, startBatchWorker, getBatchStatus };
