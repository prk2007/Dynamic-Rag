# Dynamic RAG - Architecture & Flow Diagrams

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Dynamic RAG Platform                            │
│                     Multi-Tenant Document RAG System                     │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                           Client Layer                                    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌────────────┐ │
│  │   Next.js   │   │     n8n     │   │   Cursor    │   │    curl    │ │
│  │  Dashboard  │   │  Workflows  │   │     IDE     │   │  / Postman │ │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬─────┘ │
│         │                 │                  │                 │        │
└─────────┼─────────────────┼──────────────────┼─────────────────┼────────┘
          │                 │                  │                 │
          └─────────────────┴──────────────────┴─────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          API Gateway Layer                                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│                    ┌──────────────────────────┐                          │
│                    │   Express API Server     │                          │
│                    │   (dynamicrag-api)       │                          │
│                    │   Port: 3001             │                          │
│                    └───────────┬──────────────┘                          │
│                                │                                          │
│         ┌──────────────────────┼──────────────────────┐                  │
│         │                      │                      │                  │
│    ┌────▼────┐          ┌──────▼──────┐      ┌───────▼──────┐           │
│    │  Auth   │          │  Document   │      │     MCP      │           │
│    │ Routes  │          │   Routes    │      │   Routes     │           │
│    │  /auth  │          │   /docs     │      │    /mcp      │           │
│    └─────────┘          └─────────────┘      └──────────────┘           │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
          ▼                           ▼                           ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│  Middleware Layer   │   │  Processing Layer    │   │   Storage Layer     │
├─────────────────────┤   ├─────────────────────┤   ├─────────────────────┤
│                     │   │                     │   │                     │
│ ┌─────────────────┐ │   │ ┌─────────────────┐ │   │ ┌─────────────────┐ │
│ │ Authentication  │ │   │ │   BullMQ Queue  │ │   │ │   PostgreSQL    │ │
│ │  Middleware     │ │   │ │                 │ │   │ │   Database      │ │
│ │  - JWT Verify   │ │   │ │ - Doc Jobs      │ │   │ │                 │ │
│ └─────────────────┘ │   │ │ - Webhook Jobs  │ │   │ │ - customers     │ │
│                     │   │ │ - Embedding Jobs│ │   │ │ - documents     │ │
│ ┌─────────────────┐ │   │ └────────┬────────┘ │   │ │ - config        │ │
│ │  Rate Limiting  │ │   │          │          │   │ │ - metrics       │ │
│ │  Per Customer   │ │   │          ▼          │   │ └─────────────────┘ │
│ └─────────────────┘ │   │ ┌─────────────────┐ │   │                     │
│                     │   │ │  Worker Process │ │   │ ┌─────────────────┐ │
│ ┌─────────────────┐ │   │ │ (dynamicrag-   │ │   │ │     Redis       │ │
│ │   Encryption    │ │   │ │  worker)        │ │   │ │                 │ │
│ │   AES-256       │ │   │ │                 │ │   │ │ - Queue State   │ │
│ └─────────────────┘ │   │ │ - PDF Parse     │ │   │ │ - Job Status    │ │
│                     │   │ │ - Web Scrape    │ │   │ │ - Rate Limits   │ │
└─────────────────────┘   │ │ - Chunk Text    │ │   │ └─────────────────┘ │
                          │ │ - Embed Text    │ │   │                     │
                          │ └─────────────────┘ │   │ ┌─────────────────┐ │
                          │                     │   │ │   LanceDB       │ │
                          └─────────────────────┘   │ │  (Per Customer) │ │
                                                    │ │                 │ │
                                                    │ │ - Embeddings    │ │
                                                    │ │ - Vector Search │ │
                                                    │ │ - Metadata      │ │
                                                    │ └─────────────────┘ │
                                                    │                     │
                                                    │ ┌─────────────────┐ │
                                                    │ │   AWS S3        │ │
                                                    │ │                 │ │
                                                    │ │ - PDF Files     │ │
                                                    │ │ - Documents     │ │
                                                    │ └─────────────────┘ │
                                                    └─────────────────────┘
```

## 2. Authentication Flow (Per-Customer JWT Secrets)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Signup Flow                                      │
└──────────────────────────────────────────────────────────────────────────┘

    Client                  API Server              Database
      │                         │                       │
      │  POST /api/auth/signup  │                       │
      │  { email, password }    │                       │
      ├────────────────────────>│                       │
      │                         │                       │
      │                         │  1. Validate Input    │
      │                         │     - Email format    │
      │                         │     - Password rules  │
      │                         │                       │
      │                         │  2. Check if exists   │
      │                         ├──────────────────────>│
      │                         │  SELECT * FROM        │
      │                         │  customers WHERE      │
      │                         │  email = ?            │
      │                         │<──────────────────────┤
      │                         │  (no results)         │
      │                         │                       │
      │                         │  3. Generate Secrets  │
      │                         │     ┌──────────────┐  │
      │                         │     │ Password Hash│  │
      │                         │     │ (bcrypt)     │  │
      │                         │     └──────────────┘  │
      │                         │     ┌──────────────┐  │
      │                         │     │  API Key     │  │
      │                         │     │ (64 random)  │  │
      │                         │     └──────────────┘  │
      │                         │     ┌──────────────┐  │
      │                         │     │ JWT Secret   │  │
      │                         │     │ (128 random) │  │
      │                         │     └──────────────┘  │
      │                         │     ┌──────────────┐  │
      │                         │     │JWT Refresh   │  │
      │                         │     │   Secret     │  │
      │                         │     │ (128 random) │  │
      │                         │     └──────────────┘  │
      │                         │                       │
      │                         │  4. Encrypt Secrets   │
      │                         │     (AES-256)         │
      │                         │                       │
      │                         │  5. Insert Customer   │
      │                         ├──────────────────────>│
      │                         │  INSERT INTO          │
      │                         │  customers (email,    │
      │                         │  password_hash,       │
      │                         │  jwt_secret,          │
      │                         │  jwt_refresh_secret)  │
      │                         │<──────────────────────┤
      │                         │  customer_id: uuid    │
      │                         │                       │
      │                         │  6. Create Config     │
      │                         ├──────────────────────>│
      │                         │  INSERT INTO          │
      │                         │  customer_config      │
      │                         │<──────────────────────┤
      │                         │                       │
      │                         │  7. Fetch JWT Secrets │
      │                         ├──────────────────────>│
      │                         │  SELECT jwt_secret,   │
      │                         │  jwt_refresh_secret   │
      │                         │<──────────────────────┤
      │                         │  (encrypted secrets)  │
      │                         │                       │
      │                         │  8. Decrypt Secrets   │
      │                         │     (AES-256 decrypt) │
      │                         │                       │
      │                         │  9. Generate Tokens   │
      │                         │     ┌──────────────┐  │
      │                         │     │Access Token  │  │
      │                         │     │(customer's   │  │
      │                         │     │ JWT secret)  │  │
      │                         │     │exp: 24h      │  │
      │                         │     └──────────────┘  │
      │                         │     ┌──────────────┐  │
      │                         │     │Refresh Token │  │
      │                         │     │(customer's   │  │
      │                         │     │ refresh sec) │  │
      │                         │     │exp: 7d       │  │
      │                         │     └──────────────┘  │
      │                         │                       │
      │                         │  10. Store Refresh    │
      │                         │      Token Hash       │
      │                         ├──────────────────────>│
      │                         │  INSERT INTO          │
      │                         │  refresh_tokens       │
      │                         │<──────────────────────┤
      │                         │                       │
      │  200 OK                 │                       │
      │  {                      │                       │
      │    customer: {...},     │                       │
      │    accessToken: "...",  │                       │
      │    refreshToken: "..." │                       │
      │  }                      │                       │
      │<────────────────────────┤                       │
      │                         │                       │
```

## 3. Login Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            Login Flow                                     │
└──────────────────────────────────────────────────────────────────────────┘

    Client                  API Server              Database
      │                         │                       │
      │  POST /api/auth/login   │                       │
      │  { email, password }    │                       │
      ├────────────────────────>│                       │
      │                         │                       │
      │                         │  1. Find Customer     │
      │                         ├──────────────────────>│
      │                         │  SELECT * FROM        │
      │                         │  customers WHERE      │
      │                         │  email = ?            │
      │                         │<──────────────────────┤
      │                         │  customer data        │
      │                         │                       │
      │                         │  2. Verify Password   │
      │                         │     bcrypt.compare()  │
      │                         │                       │
      │                         │  3. Fetch JWT Secrets │
      │                         ├──────────────────────>│
      │                         │  SELECT jwt_secret,   │
      │                         │  jwt_refresh_secret   │
      │                         │  WHERE id = ?         │
      │                         │<──────────────────────┤
      │                         │  (encrypted secrets)  │
      │                         │                       │
      │                         │  4. Decrypt Secrets   │
      │                         │     (AES-256)         │
      │                         │                       │
      │                         │  5. Generate Tokens   │
      │                         │     (using customer's │
      │                         │      unique secrets)  │
      │                         │                       │
      │                         │  6. Store Refresh     │
      │                         │     Token Hash        │
      │                         ├──────────────────────>│
      │                         │                       │
      │  200 OK                 │                       │
      │  { accessToken, ... }   │                       │
      │<────────────────────────┤                       │
      │                         │                       │
```

## 4. Protected Endpoint Access Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                   Protected Endpoint Access Flow                          │
└──────────────────────────────────────────────────────────────────────────┘

    Client                  API Server              Database
      │                         │                       │
      │  GET /api/auth/me       │                       │
      │  Authorization: Bearer  │                       │
      │  <access_token>         │                       │
      ├────────────────────────>│                       │
      │                         │                       │
      │                    ┌────▼────┐                  │
      │                    │  Auth   │                  │
      │                    │Middleware│                 │
      │                    └────┬────┘                  │
      │                         │                       │
      │                         │  1. Extract Token     │
      │                         │     from Header       │
      │                         │                       │
      │                         │  2. Decode Token      │
      │                         │     (NO verification) │
      │                         │     Get customer_id   │
      │                         │                       │
      │                         │  3. Fetch Customer's  │
      │                         │     JWT Secret        │
      │                         ├──────────────────────>│
      │                         │  SELECT jwt_secret    │
      │                         │  FROM customers       │
      │                         │  WHERE id = ?         │
      │                         │<──────────────────────┤
      │                         │  (encrypted secret)   │
      │                         │                       │
      │                         │  4. Decrypt Secret    │
      │                         │     (AES-256)         │
      │                         │                       │
      │                         │  5. Verify Token      │
      │                         │     jwt.verify(token, │
      │                         │     customerSecret)   │
      │                         │                       │
      │                         │  ✓ Valid Token        │
      │                         │                       │
      │                         │  6. Load Customer     │
      │                         ├──────────────────────>│
      │                         │  SELECT * FROM        │
      │                         │  customers WHERE      │
      │                         │  id = ?               │
      │                         │<──────────────────────┤
      │                         │                       │
      │                         │  7. Load Config       │
      │                         ├──────────────────────>│
      │                         │  SELECT * FROM        │
      │                         │  customer_config      │
      │                         │<──────────────────────┤
      │                         │                       │
      │                         │  8. Attach to Request │
      │                         │     req.customerId    │
      │                         │     req.customerConfig│
      │                         │                       │
      │                    ┌────▼────┐                  │
      │                    │  Route  │                  │
      │                    │ Handler │                  │
      │                    └────┬────┘                  │
      │                         │                       │
      │  200 OK                 │                       │
      │  { customer, config }   │                       │
      │<────────────────────────┤                       │
      │                         │                       │
```

## 5. Token Refresh Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Token Refresh Flow                                 │
└──────────────────────────────────────────────────────────────────────────┘

    Client                  API Server              Database
      │                         │                       │
      │  POST /api/auth/refresh │                       │
      │  { refreshToken }       │                       │
      ├────────────────────────>│                       │
      │                         │                       │
      │                         │  1. Decode Token      │
      │                         │     Get customer_id   │
      │                         │                       │
      │                         │  2. Fetch Secrets     │
      │                         ├──────────────────────>│
      │                         │  SELECT               │
      │                         │  jwt_refresh_secret   │
      │                         │<──────────────────────┤
      │                         │                       │
      │                         │  3. Verify Refresh    │
      │                         │     Token             │
      │                         │                       │
      │                         │  4. Check Token Hash  │
      │                         ├──────────────────────>│
      │                         │  SELECT * FROM        │
      │                         │  refresh_tokens WHERE │
      │                         │  token_hash = ? AND   │
      │                         │  revoked = false      │
      │                         │<──────────────────────┤
      │                         │                       │
      │                         │  5. Revoke Old Token  │
      │                         ├──────────────────────>│
      │                         │  UPDATE refresh_tokens│
      │                         │  SET revoked = true   │
      │                         │<──────────────────────┤
      │                         │                       │
      │                         │  6. Generate New Pair │
      │                         │     (new access +     │
      │                         │      new refresh)     │
      │                         │                       │
      │                         │  7. Store New Refresh │
      │                         ├──────────────────────>│
      │                         │  INSERT INTO          │
      │                         │  refresh_tokens       │
      │                         │<──────────────────────┤
      │                         │                       │
      │  200 OK                 │                       │
      │  { accessToken,         │                       │
      │    refreshToken }       │                       │
      │<────────────────────────┤                       │
      │                         │                       │
```

## 6. Document Processing Flow (Phase 2)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    Document Upload & Processing                           │
└──────────────────────────────────────────────────────────────────────────┘

    Client           API Server         Queue          Worker        Storage
      │                  │                │               │              │
      │ POST /docs/upload│                │               │              │
      │ file + metadata  │                │               │              │
      ├─────────────────>│                │               │              │
      │                  │                │               │              │
      │             ┌────▼────┐           │               │              │
      │             │  Auth   │           │               │              │
      │             │  Check  │           │               │              │
      │             └────┬────┘           │               │              │
      │                  │                │               │              │
      │             ┌────▼────┐           │               │              │
      │             │  Rate   │           │               │              │
      │             │  Limit  │           │               │              │
      │             └────┬────┘           │               │              │
      │                  │                │               │              │
      │                  │ 1. Upload to S3│               │              │
      │                  ├────────────────┼───────────────┼─────────────>│
      │                  │                │               │   S3 PUT     │
      │                  │<───────────────┼───────────────┼──────────────┤
      │                  │   S3 URL       │               │              │
      │                  │                │               │              │
      │                  │ 2. Save to DB  │               │              │
      │                  │   (metadata)   │               │              │
      │                  │                │               │              │
      │                  │ 3. Queue Job   │               │              │
      │                  ├───────────────>│               │              │
      │                  │  {             │               │              │
      │                  │   type: 'pdf', │               │              │
      │                  │   docId,       │               │              │
      │                  │   customerId,  │               │              │
      │                  │   s3Url        │               │              │
      │                  │  }             │               │              │
      │                  │                │               │              │
      │  202 Accepted    │                │               │              │
      │  { docId, ... }  │                │               │              │
      │<─────────────────┤                │               │              │
      │                  │                │               │              │
      │                  │                │ 4. Pick Job   │              │
      │                  │                ├──────────────>│              │
      │                  │                │               │              │
      │                  │                │          ┌────▼────┐         │
      │                  │                │          │ Download│         │
      │                  │                │          │from S3  │         │
      │                  │                │          └────┬────┘         │
      │                  │                │               │              │
      │                  │                │          ┌────▼────┐         │
      │                  │                │          │  Parse  │         │
      │                  │                │          │   PDF   │         │
      │                  │                │          └────┬────┘         │
      │                  │                │               │              │
      │                  │                │          ┌────▼────┐         │
      │                  │                │          │  Chunk  │         │
      │                  │                │          │  Text   │         │
      │                  │                │          └────┬────┘         │
      │                  │                │               │              │
      │                  │                │          ┌────▼────┐         │
      │                  │                │          │ Generate│         │
      │                  │                │          │Embeddings│        │
      │                  │                │          └────┬────┘         │
      │                  │                │               │              │
      │                  │                │          ┌────▼────┐         │
      │                  │                │          │  Store  │         │
      │                  │                │          │LanceDB  │         │
      │                  │                │          └────┬────┘         │
      │                  │                │               │              │
      │                  │                │          ┌────▼────┐         │
      │                  │                │          │ Update  │         │
      │                  │                │          │  Status │         │
      │                  │                │          │  in DB  │         │
      │                  │                │          └────┬────┘         │
      │                  │                │               │              │
      │                  │                │ 5. Job Done   │              │
      │                  │                │<──────────────┤              │
      │                  │                │               │              │
```

## 7. Multi-Tenant Isolation

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      Multi-Tenant Data Isolation                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                           Customer A                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                │
│  │ JWT Secrets  │   │  API Key     │   │  OpenAI Key  │                │
│  │ (encrypted)  │   │ (unique)     │   │ (encrypted)  │                │
│  └──────────────┘   └──────────────┘   └──────────────┘                │
│                                                                          │
│  ┌──────────────────────────────────────────────────────┐               │
│  │         LanceDB: /data/customers/{customer-a-id}/    │               │
│  │         ┌────────────┐       ┌────────────┐          │               │
│  │         │  catalog   │       │   chunks   │          │               │
│  │         │   table    │       │   table    │          │               │
│  │         └────────────┘       └────────────┘          │               │
│  └──────────────────────────────────────────────────────┘               │
│                                                                          │
│  ┌──────────────────────────────────────────────────────┐               │
│  │         S3: /customers/{customer-a-id}/documents/    │               │
│  │         ┌────────┐  ┌────────┐  ┌────────┐           │               │
│  │         │ doc1   │  │ doc2   │  │ doc3   │           │               │
│  │         └────────┘  └────────┘  └────────┘           │               │
│  └──────────────────────────────────────────────────────┘               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                           Customer B                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                │
│  │ JWT Secrets  │   │  API Key     │   │  OpenAI Key  │                │
│  │ (encrypted)  │   │ (unique)     │   │ (encrypted)  │                │
│  │  DIFFERENT   │   │  DIFFERENT   │   │  DIFFERENT   │                │
│  └──────────────┘   └──────────────┘   └──────────────┘                │
│                                                                          │
│  ┌──────────────────────────────────────────────────────┐               │
│  │         LanceDB: /data/customers/{customer-b-id}/    │               │
│  │         ┌────────────┐       ┌────────────┐          │               │
│  │         │  catalog   │       │   chunks   │          │               │
│  │         │   table    │       │   table    │          │               │
│  │         └────────────┘       └────────────┘          │               │
│  └──────────────────────────────────────────────────────┘               │
│                                                                          │
│  ┌──────────────────────────────────────────────────────┐               │
│  │         S3: /customers/{customer-b-id}/documents/    │               │
│  │         ┌────────┐  ┌────────┐                       │               │
│  │         │ doc1   │  │ doc2   │                       │               │
│  │         └────────┘  └────────┘                       │               │
│  └──────────────────────────────────────────────────────┘               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────────┐
                    │  Shared PostgreSQL   │
                    │                      │
                    │  Row-level isolation │
                    │  by customer_id      │
                    └──────────────────────┘
```

## 8. Security Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Security Layers                                    │
└──────────────────────────────────────────────────────────────────────────┘

Layer 1: Transport Security
┌────────────────────────────────────────┐
│           HTTPS / TLS 1.3              │
│    (All traffic encrypted in transit)  │
└────────────────────────────────────────┘

Layer 2: Authentication
┌────────────────────────────────────────┐
│      Per-Customer JWT Secrets          │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │  Customer A                      │ │
│  │  jwt_secret: 128-char random     │ │
│  │  jwt_refresh_secret: 128-char    │ │
│  └──────────────────────────────────┘ │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │  Customer B                      │ │
│  │  jwt_secret: DIFFERENT           │ │
│  │  jwt_refresh_secret: DIFFERENT   │ │
│  └──────────────────────────────────┘ │
│                                        │
│  ✓ Token compromise isolated         │
│  ✓ Individual revocation possible    │
└────────────────────────────────────────┘

Layer 3: Encryption at Rest
┌────────────────────────────────────────┐
│         AES-256-CBC Encryption         │
│                                        │
│  Encrypted Fields:                    │
│  • JWT secrets                        │
│  • JWT refresh secrets                │
│  • OpenAI API keys                    │
│  • Customer-sensitive data            │
│                                        │
│  Master Key: ENCRYPTION_KEY (env var) │
└────────────────────────────────────────┘

Layer 4: Password Security
┌────────────────────────────────────────┐
│          bcrypt (10 rounds)            │
│                                        │
│  Requirements:                        │
│  • Min 8 characters                   │
│  • Uppercase + lowercase              │
│  • Numbers                            │
│  • Special characters                 │
└────────────────────────────────────────┘

Layer 5: Rate Limiting
┌────────────────────────────────────────┐
│      Per-Customer Rate Limits          │
│                                        │
│  Default:                             │
│  • 60 requests/minute                 │
│  • 10,000 requests/day                │
│                                        │
│  Configurable per customer            │
└────────────────────────────────────────┘

Layer 6: Data Isolation
┌────────────────────────────────────────┐
│     Filesystem + Database Isolation    │
│                                        │
│  • Separate LanceDB per customer      │
│  • Separate S3 prefix per customer    │
│  • Row-level filtering by customer_id │
└────────────────────────────────────────┘
```

## 9. Database Schema Relationships

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      Database Schema (Phase 1)                            │
└──────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────┐
│           customers                 │
├─────────────────────────────────────┤
│ PK │ id (uuid)                      │
│    │ email (unique)                 │
│    │ password_hash                  │
│    │ company_name                   │
│    │ api_key (unique)               │
│    │ openai_api_key (encrypted)     │
│    │ jwt_secret (encrypted) ◄───────┼─── Per-customer unique!
│    │ jwt_refresh_secret (encrypted) │
│    │ status                         │
│    │ created_at                     │
│    │ updated_at                     │
└──────────┬──────────────────────────┘
           │
           │ 1:1
           │
           ▼
┌─────────────────────────────────────┐
│        customer_config              │
├─────────────────────────────────────┤
│ PK │ id                             │
│ FK │ customer_id ────────────────┐  │
│    │ rate_limit_requests_per_min│  │
│    │ rate_limit_requests_per_day│  │
│    │ max_documents              │  │
│    │ max_file_size_mb           │  │
│    │ allowed_document_types     │  │
│    │ chunking_size              │  │
│    │ chunking_overlap           │  │
│    │ embedding_model            │  │
│    │ monthly_budget_usd         │  │
│    │ budget_alert_threshold     │  │
└────────────────────────────────────┘
           │
           │ 1:N
           │
           ▼
┌─────────────────────────────────────┐
│        refresh_tokens               │
├─────────────────────────────────────┤
│ PK │ id                             │
│ FK │ customer_id                    │
│    │ token_hash (sha256)            │
│    │ expires_at                     │
│    │ revoked (boolean)              │
│    │ created_at                     │
└─────────────────────────────────────┘

           │
           │ 1:N
           │
           ▼
┌─────────────────────────────────────┐
│          documents (Phase 2)        │
├─────────────────────────────────────┤
│ PK │ id                             │
│ FK │ customer_id                    │
│    │ title                          │
│    │ type (pdf/html/txt)            │
│    │ s3_key                         │
│    │ status                         │
│    │ content_hash                   │
│    │ chunk_count                    │
└─────────────────────────────────────┘
```

## 10. Docker Container Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       Docker Compose Setup                                │
└──────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      dynamicrag-network (bridge)                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────┐      ┌──────────────────────┐                │
│  │  dynamicrag-api      │      │  dynamicrag-worker   │                │
│  │                      │      │                      │                │
│  │  Image: node:20-alpine│     │  Image: node:20-alpine│               │
│  │  Port: 3001:3001     │      │  No external ports   │                │
│  │                      │      │                      │                │
│  │  Depends on:         │      │  Depends on:         │                │
│  │  - postgres          │      │  - postgres          │                │
│  │  - redis             │      │  - redis             │                │
│  │                      │      │                      │                │
│  │  Volumes:            │      │  Volumes:            │                │
│  │  - ./data (bind)     │      │  - ./data (bind)     │                │
│  │                      │      │                      │                │
│  │  Health check:       │      │  No health check     │                │
│  │  GET /health         │      │                      │                │
│  └──────────┬───────────┘      └──────────┬───────────┘                │
│             │                             │                             │
│             └──────────┬──────────────────┘                             │
│                        │                                                │
│         ┌──────────────┼──────────────┐                                 │
│         │              │              │                                 │
│         ▼              ▼              ▼                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                    │
│  │ postgres    │  │   redis     │  │  .env file  │                    │
│  │             │  │             │  │             │                    │
│  │ Image:      │  │ Image:      │  │ Mounted to  │                    │
│  │ postgres:16 │  │ redis:7-    │  │ containers  │                    │
│  │             │  │ alpine      │  │             │                    │
│  │ Port:       │  │             │  │ Contains:   │                    │
│  │ 5432:5432   │  │ Port:       │  │ - DB creds  │                    │
│  │             │  │ 6379:6379   │  │ - Encrypt   │                    │
│  │ Volume:     │  │             │  │   key       │                    │
│  │ postgres_   │  │ Volume:     │  │ - Secrets   │                    │
│  │ data        │  │ redis_data  │  │             │                    │
│  │             │  │             │  │             │                    │
│  │ Health:     │  │ Health:     │  │             │                    │
│  │ pg_isready  │  │ redis-cli   │  │             │                    │
│  │             │  │ ping        │  │             │                    │
│  └─────────────┘  └─────────────┘  └─────────────┘                    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

        Persistent Volumes:
        ┌─────────────────┐
        │ postgres_data   │ ──► Database persists across restarts
        └─────────────────┘
        ┌─────────────────┐
        │ redis_data      │ ──► Queue state persists across restarts
        └─────────────────┘
```

---

## Legend

```
┌────┐
│ PK │  Primary Key
└────┘
┌────┐
│ FK │  Foreign Key
└────┘
  │
  ├──>  One-to-Many relationship
  │
  ───>  Data flow / API call
  │
  ▼    Process flow
```

## Color Coding (for enhanced diagrams)

- 🔵 **Blue**: Client/User layer
- 🟢 **Green**: API/Server layer
- 🟡 **Yellow**: Processing/Queue layer
- 🟣 **Purple**: Storage/Database layer
- 🔴 **Red**: Security/Authentication layer

---

**Generated**: Phase 1 Implementation
**Last Updated**: Docker Setup Complete
**Status**: ✅ Production Ready
