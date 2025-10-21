#!/usr/bin/env node
import { Worker, Job } from 'bullmq';
import { redisConnection } from '../queue/connection.js';
import type { ProcessDocumentJob, ScrapeUrlJob } from '../queue/queues.js';
import { s3Service } from '../services/s3.service.js';
import { documentParser } from '../utils/parsers.js';
import { embeddingService } from '../services/embedding.service.js';
import { lancedbService } from '../services/lancedb.service.js';
import { documentModel } from '../models/document.js';
import { findCustomerById } from '../models/customer.js';
import { customerConfigModel } from '../models/customer-config.js';
import { decrypt } from '../auth/encryption.js';

/**
 * Document Processing Worker
 * Handles background processing of uploaded documents
 */
class DocumentWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      'document-processing',
      async (job: Job) => this.processJob(job),
      {
        connection: redisConnection,
        concurrency: 5, // Process 5 jobs concurrently
        limiter: {
          max: 10, // Max 10 jobs
          duration: 1000, // Per second
        },
      }
    );

    this.setupEventListeners();
  }

  /**
   * Process job based on type
   */
  private async processJob(job: Job): Promise<any> {
    const jobData = job.data;

    console.log(`📝 Processing job ${job.id} (${jobData.type})`);

    try {
      switch (jobData.type) {
        case 'process_document':
          return await this.processDocument(job, jobData as ProcessDocumentJob);

        case 'scrape_url':
          return await this.scrapeUrl(job, jobData as ScrapeUrlJob);

        default:
          throw new Error(`Unknown job type: ${jobData.type}`);
      }
    } catch (error) {
      console.error(`❌ Job ${job.id} failed:`, error);
      throw error;
    }
  }

  /**
   * Process uploaded document
   */
  private async processDocument(
    job: Job,
    data: ProcessDocumentJob
  ): Promise<{
    documentId: string;
    chunks: number;
    tokensUsed: number;
    cost: number;
  }> {
    const { customerId, documentId, s3Key, documentType } = data;
    const startTime = Date.now();

    try {
      // Update progress
      await job.updateProgress({ stage: 'downloading', progress: 0 });

      // 1. Download file from S3
      console.log(`📥 Downloading document ${documentId} from S3`);
      const fileBuffer = await s3Service.downloadFile(s3Key);

      await job.updateProgress({ stage: 'parsing', progress: 20 });

      // 2. Parse document
      console.log(`📄 Parsing ${documentType} document ${documentId}`);
      const parsed = await documentParser.parse(fileBuffer, documentType);

      await job.updateProgress({ stage: 'embedding', progress: 40 });

      // 3. Get customer config
      const config = await customerConfigModel.getConfig(customerId);

      // 4. Get customer's OpenAI API key
      const customer = await findCustomerById(customerId);
      if (!customer) {
        throw new Error('Customer not found');
      }

      // Decrypt OpenAI API key
      const openaiApiKey = customer.openai_api_key
        ? decrypt(customer.openai_api_key)
        : process.env.OPENAI_API_KEY;

      if (!openaiApiKey) {
        throw new Error('No OpenAI API key available');
      }

      // 5. Chunk and embed document
      console.log(`🔢 Chunking and embedding document ${documentId}`);
      const { chunks, stats } = await embeddingService.processDocument(
        parsed.content,
        {
          documentId,
          customerId,
          title: parsed.metadata.title,
          chunkSize: config.chunking_size,
          overlap: config.chunking_overlap,
          apiKey: openaiApiKey,
          model: config.embedding_model,
        }
      );

      await job.updateProgress({ stage: 'storing', progress: 70 });

      // 6. Store in LanceDB
      console.log(`💾 Storing ${chunks.length} chunks in LanceDB`);
      await lancedbService.addChunks(customerId, documentId, chunks);

      await job.updateProgress({ stage: 'finalizing', progress: 90 });

      // 7. Update document status in database
      const processingTime = Date.now() - startTime;

      await documentModel.markCompleted(documentId, customerId, {
        chunk_count: stats.totalChunks,
        character_count: stats.totalCharacters,
        page_count: parsed.metadata.pageCount,
        embedding_tokens_used: stats.tokensUsed,
        embedding_cost_usd: stats.cost,
        processing_time_ms: processingTime,
      });

      await job.updateProgress({ stage: 'completed', progress: 100 });

      console.log(`✅ Document ${documentId} processed successfully`);

      return {
        documentId,
        chunks: stats.totalChunks,
        tokensUsed: stats.tokensUsed,
        cost: stats.cost,
      };
    } catch (error) {
      console.error(`❌ Error processing document ${documentId}:`, error);

      // Mark document as failed
      await documentModel.markFailed(
        documentId,
        customerId,
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    }
  }

  /**
   * Scrape and process URL
   */
  private async scrapeUrl(
    job: Job,
    data: ScrapeUrlJob
  ): Promise<{
    documentId: string;
    chunks: number;
    tokensUsed: number;
    cost: number;
  }> {
    const { customerId, documentId, url } = data;
    const startTime = Date.now();

    try {
      await job.updateProgress({ stage: 'fetching', progress: 0 });

      // 1. Fetch URL content
      console.log(`🌐 Fetching URL: ${url}`);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const buffer = Buffer.from(await response.arrayBuffer());

      await job.updateProgress({ stage: 'parsing', progress: 20 });

      // 2. Parse content (assume HTML for now)
      let parsed;
      if (contentType.includes('text/html')) {
        parsed = await documentParser.parse(buffer, 'html');
      } else if (contentType.includes('text/plain')) {
        parsed = await documentParser.parse(buffer, 'txt');
      } else {
        throw new Error(`Unsupported content type: ${contentType}`);
      }

      // 3. Store in S3
      const filename = new URL(url).pathname.split('/').pop() || 'scraped.html';
      const s3Key = s3Service.generateKey(customerId, documentId, filename);

      await s3Service.uploadFile(
        s3Key,
        buffer,
        contentType,
        { source_url: url }
      );

      // Update document with S3 key
      await documentModel.update(documentId, customerId, {});

      await job.updateProgress({ stage: 'embedding', progress: 40 });

      // 4. Get customer config and API key
      const config = await customerConfigModel.getConfig(customerId);
      const customer = await findCustomerById(customerId);

      if (!customer) {
        throw new Error('Customer not found');
      }

      const openaiApiKey = customer.openai_api_key
        ? decrypt(customer.openai_api_key)
        : process.env.OPENAI_API_KEY;

      if (!openaiApiKey) {
        throw new Error('No OpenAI API key available');
      }

      // 5. Chunk and embed
      console.log(`🔢 Processing content from ${url}`);
      const { chunks, stats } = await embeddingService.processDocument(
        parsed.content,
        {
          documentId,
          customerId,
          title: parsed.metadata.title || new URL(url).hostname,
          chunkSize: config.chunking_size,
          overlap: config.chunking_overlap,
          apiKey: openaiApiKey,
          model: config.embedding_model,
        }
      );

      await job.updateProgress({ stage: 'storing', progress: 70 });

      // 6. Store in LanceDB
      await lancedbService.addChunks(customerId, documentId, chunks);

      await job.updateProgress({ stage: 'finalizing', progress: 90 });

      // 7. Update document status
      const processingTime = Date.now() - startTime;

      await documentModel.markCompleted(documentId, customerId, {
        chunk_count: stats.totalChunks,
        character_count: stats.totalCharacters,
        page_count: parsed.metadata.pageCount,
        embedding_tokens_used: stats.tokensUsed,
        embedding_cost_usd: stats.cost,
        processing_time_ms: processingTime,
      });

      await job.updateProgress({ stage: 'completed', progress: 100 });

      console.log(`✅ URL ${url} processed successfully`);

      return {
        documentId,
        chunks: stats.totalChunks,
        tokensUsed: stats.tokensUsed,
        cost: stats.cost,
      };
    } catch (error) {
      console.error(`❌ Error processing URL ${url}:`, error);

      await documentModel.markFailed(
        documentId,
        customerId,
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.worker.on('completed', (job) => {
      console.log(`✅ Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, error) => {
      console.error(`❌ Job ${job?.id} failed:`, error.message);
    });

    this.worker.on('error', (error) => {
      console.error('Worker error:', error);
    });

    this.worker.on('active', (job) => {
      console.log(`⚡ Job ${job.id} started`);
    });
  }

  /**
   * Start worker
   */
  async start(): Promise<void> {
    console.log('🚀 Document processing worker started');
    console.log('📊 Concurrency: 5 jobs');
    console.log('⏳ Rate limit: 10 jobs/second');
  }

  /**
   * Stop worker
   */
  async stop(): Promise<void> {
    await this.worker.close();
    console.log('🛑 Document processing worker stopped');
  }
}

// Run worker if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = new DocumentWorker();

  worker.start().catch((error) => {
    console.error('Failed to start worker:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down...');
    await worker.stop();
    await lancedbService.closeAllConnections();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down...');
    await worker.stop();
    await lancedbService.closeAllConnections();
    process.exit(0);
  });
}

export { DocumentWorker };
