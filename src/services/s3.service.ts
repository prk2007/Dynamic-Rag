import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { Readable } from 'stream';

/**
 * S3/MinIO Service for Document Storage
 * Provides tenant-isolated file storage with presigned URLs
 */
export class S3Service {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION || 'us-east-1';
    const forcePathStyle = !!endpoint; // Required for MinIO

    this.client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
      forcePathStyle,
      ...(process.env.S3_USE_SSL === 'false' && { tls: false }),
    });

    this.bucket = process.env.S3_BUCKET || 'dynamic-rag-documents';
  }

  /**
   * Generate S3 key with customer isolation
   * Format: {customerId}/documents/{documentId}/{filename}
   */
  generateKey(customerId: string, documentId: string, filename: string): string {
    // Sanitize filename to prevent path traversal
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${customerId}/documents/${documentId}/${sanitizedFilename}`;
  }

  /**
   * Generate unique S3 key for versioning
   * Format: {customerId}/documents/{documentId}/versions/{hash}/{filename}
   */
  generateVersionKey(
    customerId: string,
    documentId: string,
    hash: string,
    filename: string
  ): string {
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${customerId}/documents/${documentId}/versions/${hash}/${sanitizedFilename}`;
  }

  /**
   * Upload file to S3/MinIO
   */
  async uploadFile(
    key: string,
    buffer: Buffer,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<{
    key: string;
    size: number;
    contentType: string;
    etag: string;
  }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        Metadata: metadata,
      });

      const response = await this.client.send(command);

      return {
        key,
        size: buffer.length,
        contentType,
        etag: response.ETag || '',
      };
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new Error(`Failed to upload file to S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download file from S3/MinIO
   */
  async downloadFile(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        throw new Error('No file body received from S3');
      }

      // Convert stream to buffer
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
      });
    } catch (error) {
      console.error('S3 download error:', error);
      throw new Error(`Failed to download file from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete file from S3/MinIO
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      console.log(`🗑️  Deleted file from S3: ${key}`);
    } catch (error) {
      console.error('S3 delete error:', error);
      throw new Error(`Failed to delete file from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(key: string): Promise<{
    size: number;
    contentType: string;
    lastModified: Date;
    metadata: Record<string, string>;
  }> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      return {
        size: response.ContentLength || 0,
        contentType: response.ContentType || 'application/octet-stream',
        lastModified: response.LastModified || new Date(),
        metadata: response.Metadata || {},
      };
    } catch (error) {
      console.error('S3 metadata error:', error);
      throw new Error(`Failed to get file metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate presigned URL for secure download
   */
  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      return await getSignedUrl(this.client, command, { expiresIn });
    } catch (error) {
      console.error('Presigned URL error:', error);
      throw new Error(`Failed to generate presigned URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate presigned URL for upload
   */
  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 3600
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      });

      return await getSignedUrl(this.client, command, { expiresIn });
    } catch (error) {
      console.error('Presigned upload URL error:', error);
      throw new Error(`Failed to generate presigned upload URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List files for a customer
   */
  async listCustomerFiles(customerId: string, prefix?: string): Promise<{
    files: Array<{
      key: string;
      size: number;
      lastModified: Date;
    }>;
    count: number;
  }> {
    try {
      const listPrefix = prefix
        ? `${customerId}/documents/${prefix}`
        : `${customerId}/documents/`;

      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: listPrefix,
      });

      const response = await this.client.send(command);

      const files = (response.Contents || []).map((item) => ({
        key: item.Key!,
        size: item.Size || 0,
        lastModified: item.LastModified || new Date(),
      }));

      return {
        files,
        count: files.length,
      };
    } catch (error) {
      console.error('S3 list error:', error);
      throw new Error(`Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete all files for a customer (use with caution!)
   */
  async deleteCustomerFiles(customerId: string): Promise<number> {
    try {
      const { files } = await this.listCustomerFiles(customerId);

      let deletedCount = 0;

      // Delete in batches of 10 (to avoid overwhelming S3)
      for (let i = 0; i < files.length; i += 10) {
        const batch = files.slice(i, i + 10);
        await Promise.all(batch.map((file) => this.deleteFile(file.key)));
        deletedCount += batch.length;
      }

      console.log(`🗑️  Deleted ${deletedCount} files for customer ${customerId}`);
      return deletedCount;
    } catch (error) {
      console.error('S3 bulk delete error:', error);
      throw new Error(`Failed to delete customer files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate content hash for deduplication
   */
  calculateHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Ensure bucket exists (for MinIO setup)
   */
  async ensureBucket(): Promise<void> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        MaxKeys: 1,
      });

      await this.client.send(command);
      console.log(`✅ S3 bucket "${this.bucket}" is accessible`);
    } catch (error: any) {
      if (error.name === 'NoSuchBucket' || error.Code === 'NoSuchBucket' || error.$metadata?.httpStatusCode === 404) {
        console.log(`⚠️  Bucket "${this.bucket}" not found. Creating...`);
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
          console.log(`✅ S3 bucket "${this.bucket}" created successfully`);
        } catch (createError: any) {
          if (createError.name === 'BucketAlreadyOwnedByYou') {
            console.log(`✅ S3 bucket "${this.bucket}" already exists`);
          } else {
            console.error('Failed to create S3 bucket:', createError);
            throw createError;
          }
        }
      } else {
        console.error('S3 bucket check error:', error);
        throw error;
      }
    }
  }
}

// Export singleton instance
export const s3Service = new S3Service();
