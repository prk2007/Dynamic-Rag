# Phase 2: MinIO Setup Summary

## 🎯 What Changed

We've updated Phase 2 design to use **MinIO** instead of local filesystem storage.

---

## ✅ Changes Made

### 1. **docker-compose.yml** - Added MinIO Service

```yaml
minio:
  image: minio/minio:latest
  container_name: dynamicrag-minio
  ports:
    - "9000:9000"      # API port
    - "9001:9001"      # Console UI port
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin123
  volumes:
    - minio_data:/data
  command: server /data --console-address ":9001"
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
    interval: 10s
    timeout: 5s
    retries: 5
```

### 2. **Environment Variables** - Updated Both Services

**API Service:**
```yaml
S3_ENDPOINT: http://minio:9000
S3_ACCESS_KEY: minioadmin
S3_SECRET_KEY: minioadmin123
S3_BUCKET: dynamic-rag-documents
S3_REGION: us-east-1
S3_USE_SSL: false
```

**Worker Service:** (Same variables added)

### 3. **.env.example** - Added MinIO Configuration

```bash
# MinIO / S3 Configuration
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin123
S3_BUCKET=dynamic-rag-documents
S3_REGION=us-east-1
S3_USE_SSL=false

# MinIO Console UI Credentials
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123
```

### 4. **Design Document** - Updated Flow Diagrams

- ✅ Updated architecture diagram to show MinIO instead of filesystem
- ✅ Updated upload flow to use S3 API
- ✅ Updated delete flow to remove from MinIO
- ✅ Added MinIO setup guide
- ✅ Added AWS S3 migration guide

---

## 🚀 How to Use MinIO

### Start MinIO

```bash
# Start all services including MinIO
docker-compose up -d

# Check MinIO is running
docker-compose ps minio
```

### Access MinIO Console

1. **Open Browser**: http://localhost:9001
2. **Login**:
   - Username: `minioadmin`
   - Password: `minioadmin123`
3. **Create Bucket** (if not exists):
   - Click "Buckets" → "Create Bucket"
   - Name: `dynamic-rag-documents`
   - Region: `us-east-1`

### MinIO Endpoints

- **API Endpoint**: http://localhost:9000 (for S3 SDK)
- **Console UI**: http://localhost:9001 (for humans)

---

## 🔧 Implementation Details

### S3 Key Structure

```
Bucket: dynamic-rag-documents/
  ├── fa28379c-bdb7-4160-883a-05ef8c3062ad/  ← customer_id
  │   ├── 550e8400-e29b-41d4-a716-446655440000.pdf
  │   ├── 660e8400-e29b-41d4-a716-446655440001.txt
  │   └── 770e8400-e29b-41d4-a716-446655440002.md
  ├── another-customer-id/
  │   └── document-id.pdf
  └── ...
```

### Upload Flow

1. **Frontend** → POST /api/documents (multipart/form-data)
2. **Backend** → Validate file (type, size)
3. **Backend** → Upload to MinIO using AWS SDK
   - Bucket: `dynamic-rag-documents`
   - Key: `{customer_id}/{document_id}.{ext}`
4. **Backend** → Save metadata to PostgreSQL
5. **Backend** → Return document object to frontend

### Delete Flow

1. **Frontend** → DELETE /api/documents/:id
2. **Backend** → Verify ownership
3. **Backend** → Delete from MinIO (S3 SDK deleteObject)
4. **Backend** → Delete from PostgreSQL
5. **Backend** → Return success

---

## 📦 Required NPM Packages

```bash
# AWS SDK for S3 (MinIO compatible)
npm install @aws-sdk/client-s3

# Multer for file uploads
npm install multer
npm install @types/multer --save-dev

# File type detection
npm install file-type

# MIME type checking
npm install mime-types
npm install @types/mime-types --save-dev
```

---

## 🧪 Testing MinIO

### 1. Test MinIO Console UI

```bash
# Open browser
open http://localhost:9001

# Login: minioadmin / minioadmin123
# Check if bucket exists
```

### 2. Test Upload with AWS SDK (Node.js)

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin123',
  },
  forcePathStyle: true, // Required for MinIO
});

// Upload test file
const command = new PutObjectCommand({
  Bucket: 'dynamic-rag-documents',
  Key: 'test/hello.txt',
  Body: 'Hello MinIO!',
  ContentType: 'text/plain',
});

await s3Client.send(command);
console.log('✅ Uploaded to MinIO!');
```

### 3. Test with curl

```bash
# Health check
curl http://localhost:9000/minio/health/live

# Should return: <MinioHealth>online</MinioHealth>
```

---

## 🚀 Production Deployment

### Option 1: Deploy with MinIO (Self-Hosted)

**Pros:**
- Full control over storage
- No AWS costs
- Good for self-hosted solutions

**Setup:**
- Keep MinIO in docker-compose.yml
- Use persistent volumes
- Consider MinIO distributed mode for HA

---

### Option 2: Deploy with AWS S3 (Managed)

**Pros:**
- Fully managed by AWS
- Highly reliable and scalable
- No infrastructure management

**Setup:**
1. Create S3 bucket in AWS
2. Update environment variables:
   ```bash
   S3_ENDPOINT=              # Empty = use AWS S3
   S3_ACCESS_KEY=your-aws-access-key
   S3_SECRET_KEY=your-aws-secret-key
   S3_BUCKET=dynamic-rag-documents
   S3_REGION=us-east-1
   S3_USE_SSL=true
   ```
3. **Code changes**: NONE! Same code works for both.

**Note**: Since this is a new project, there's no data migration needed - just start fresh with whichever storage option you choose for production.

---

## ✅ Benefits of MinIO Approach

1. **S3-Compatible**: Uses standard AWS S3 SDK
2. **No AWS Required**: Develop locally without AWS account
3. **Same Code**: Works with MinIO and AWS S3 (no code changes)
4. **Production Ready**: Can use MinIO in production or switch to S3
5. **Easy Testing**: Web console at http://localhost:9001
6. **Cost Effective**: Free for development
7. **Future Proof**: Easy migration to AWS S3 when needed

---

## 📝 Next Steps

1. ✅ Review updated design document
2. ⏳ Start implementation Phase 2.1 (Backend)
   - Install NPM packages
   - Create S3 storage service
   - Create document model
   - Create API endpoints
3. ⏳ Test with MinIO console
4. ⏳ Move to Phase 2.2 (Frontend UI)

---

## 🔗 Resources

- **MinIO Docs**: https://min.io/docs/minio/linux/index.html
- **AWS S3 SDK**: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/
- **MinIO Console**: http://localhost:9001

---

**Status**: ⏸️ Design Updated - Ready for Implementation

**Updated By**: Claude Code
**Date**: 2025-10-19
