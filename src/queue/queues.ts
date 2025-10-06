import { Queue, QueueEvents } from 'bullmq';
import { redisConnection } from './connection.js';

// Job type definitions
export enum JobType {
  PROCESS_DOCUMENT = 'process_document',
  SCRAPE_URL = 'scrape_url',
  BATCH_IMPORT = 'batch_import',
  REGENERATE_EMBEDDINGS = 'regenerate_embeddings',
  DELETE_DOCUMENT = 'delete_document',
}

export interface ProcessDocumentJob {
  type: JobType.PROCESS_DOCUMENT;
  customerId: string;
  documentId: string;
  s3Key: string;
  documentType: 'pdf' | 'txt' | 'html' | 'md';
  metadata: Record<string, any>;
}

export interface ScrapeUrlJob {
  type: JobType.SCRAPE_URL;
  customerId: string;
  documentId: string;
  url: string;
  metadata: Record<string, any>;
}

export type JobData = ProcessDocumentJob | ScrapeUrlJob;

// Document processing queue
export const documentQueue = new Queue('document-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500,
  },
});

// Queue events for monitoring
export const documentQueueEvents = new QueueEvents('document-processing', {
  connection: redisConnection,
});

// Event listeners
documentQueueEvents.on('completed', ({ jobId }) => {
  console.log(`✅ Job ${jobId} completed`);
});

documentQueueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`❌ Job ${jobId} failed: ${failedReason}`);
});

documentQueueEvents.on('progress', ({ jobId, data }) => {
  console.log(`⏳ Job ${jobId} progress:`, data);
});

/**
 * Add document processing job
 */
export async function addDocumentJob(
  jobData: JobData,
  options?: {
    priority?: number;
    delay?: number;
  }
): Promise<string> {
  const job = await documentQueue.add(jobData.type, jobData, {
    priority: options?.priority,
    delay: options?.delay,
    jobId: jobData.documentId, // Use documentId as jobId for idempotency
  });

  console.log(`📝 Added job ${job.id} to queue`);
  return job.id!;
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string): Promise<{
  status: string;
  progress?: any;
  result?: any;
  error?: string;
}> {
  const job = await documentQueue.getJob(jobId);

  if (!job) {
    return { status: 'not_found' };
  }

  const state = await job.getState();
  const progress = job.progress;

  if (state === 'completed') {
    return {
      status: 'completed',
      result: job.returnvalue,
    };
  }

  if (state === 'failed') {
    return {
      status: 'failed',
      error: job.failedReason,
    };
  }

  return {
    status: state,
    progress,
  };
}

/**
 * Cancel job
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  const job = await documentQueue.getJob(jobId);
  if (job) {
    await job.remove();
    return true;
  }
  return false;
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    documentQueue.getWaitingCount(),
    documentQueue.getActiveCount(),
    documentQueue.getCompletedCount(),
    documentQueue.getFailedCount(),
    documentQueue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Pause queue
 */
export async function pauseQueue(): Promise<void> {
  await documentQueue.pause();
  console.log('⏸️  Queue paused');
}

/**
 * Resume queue
 */
export async function resumeQueue(): Promise<void> {
  await documentQueue.resume();
  console.log('▶️  Queue resumed');
}

/**
 * Clean old jobs
 */
export async function cleanQueue(age: number = 24 * 60 * 60 * 1000): Promise<void> {
  await documentQueue.clean(age, 100, 'completed');
  await documentQueue.clean(age, 100, 'failed');
  console.log(`🧹 Cleaned jobs older than ${age}ms`);
}
