# Token Usage Metrics & Cost Tracking

## Overview

Complete token usage tracking system for monitoring OpenAI embedding costs per document, per customer, and system-wide for admin visibility.

---

## 📊 What Gets Tracked

### Per Document Metrics
- **Tokens Used**: Total tokens consumed for embeddings
- **Cost**: Calculated cost based on OpenAI pricing
- **Chunks**: Number of chunks created
- **Characters**: Total character count
- **Processing Time**: Time taken to process document

### Per Customer Metrics
- **Total Tokens**: Aggregate across all documents
- **Total Cost**: Monthly and lifetime costs
- **Document Count**: Number of documents processed
- **Average Tokens/Doc**: Efficiency metric

### System-wide Metrics (Admin Only)
- **Total Customers**: Active customer count
- **System Tokens**: All tokens used across platform
- **System Cost**: Total OpenAI costs
- **Top Token Users**: Highest consuming customers/documents
- **Average Processing Time**: Performance metric

---

## 🗄️ Database Schema Changes

### `documents` Table
Added fields:
```sql
chunk_count INTEGER DEFAULT 0,
character_count INTEGER DEFAULT 0,
embedding_tokens_used INTEGER DEFAULT 0,
embedding_cost_usd DECIMAL(10, 6) DEFAULT 0,
processing_time_ms INTEGER
```

### `usage_metrics` Table
Enhanced with:
```sql
document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
cost_usd DECIMAL(10, 6) DEFAULT 0
```

---

## 💰 Cost Calculation

### OpenAI Pricing (2024)
```typescript
const PRICING = {
  'text-embedding-3-small': $0.02 per 1M tokens,
  'text-embedding-3-large': $0.13 per 1M tokens,
  'text-embedding-ada-002': $0.10 per 1M tokens
};
```

### Token Estimation
```typescript
// Rough estimate: 1 token ≈ 4 characters
function calculateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// For production, use tiktoken for accurate counting:
// npm install @dqbd/tiktoken
```

### Example Calculation
```
Document: 200-page PDF
Characters: ~500,000 chars
Tokens: ~125,000 tokens
Cost (text-embedding-3-small): $0.0025
```

---

## 🔌 API Endpoints

### Customer Endpoints

#### Get Overview with Costs
```bash
GET /api/metrics/overview
```
**Response:**
```json
{
  "documents": {
    "total_documents": 150,
    "total_tokens": 5000000,
    "total_embedding_cost": 0.1,
    "processing": 2,
    "completed": 148,
    "failed": 0
  },
  "costs": {
    "total_cost": 0.125,
    "embedding_cost": 0.1,
    "search_cost": 0.025
  }
}
```

#### Get Token Usage Per Document
```bash
GET /api/metrics/tokens?startDate=2024-01-01&limit=100
```
**Response:**
```json
[
  {
    "id": "uuid",
    "title": "Product Documentation.pdf",
    "doc_type": "pdf",
    "chunk_count": 250,
    "character_count": 125000,
    "embedding_tokens_used": 31250,
    "embedding_cost_usd": 0.000625,
    "processing_time_ms": 15000,
    "created_at": "2024-01-15T10:30:00Z"
  }
]
```

#### Get Cost Breakdown Over Time
```bash
GET /api/metrics/costs?period=day
```
**Response:**
```json
[
  {
    "period": "2024-01-15",
    "metric_type": "embedding_tokens",
    "total_usage": 150000,
    "total_cost": 0.003,
    "count": 5
  }
]
```

### Admin Endpoints

#### Get Global Metrics
```bash
GET /api/admin/metrics/global
```
**Response:**
```json
{
  "systemStats": {
    "total_customers": 125,
    "total_documents": 15000,
    "total_tokens": 250000000,
    "total_cost": 5.0,
    "avg_tokens_per_doc": 16667,
    "avg_processing_time": 8500
  },
  "customers": [
    {
      "id": "uuid",
      "email": "customer@example.com",
      "company_name": "Acme Corp",
      "total_documents": 500,
      "total_tokens": 10000000,
      "total_cost": 0.2,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "topUsers": [
    {
      "email": "biguser@example.com",
      "title": "Large Documentation Set",
      "embedding_tokens_used": 500000,
      "embedding_cost_usd": 0.01,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

## 🎨 Frontend Components

### Customer Dashboard

#### Metrics Cards
```typescript
<MetricsCard
  title="Total Tokens Used"
  value={formatNumber(5000000)}
  subtitle="$0.10"
  icon={Zap}
/>
```

#### Cost Breakdown Card
Shows monthly costs split by:
- Embedding costs
- Search costs
- Total

#### Token Usage Table
Sortable table showing:
- Document name
- Tokens used
- Cost
- Processing time
- Date

### Admin Dashboard

#### System Overview
- Total customers
- System-wide tokens
- System-wide costs
- Average processing time

#### Customer Usage Table
- Email
- Company
- Document count
- Total tokens
- Total cost
- Member since
- Actions (view details, suspend)

#### Top Token Consumers
- Customer email
- Document title
- Tokens consumed
- Cost

---

## 📈 Usage Tracking Flow

### Document Processing
```typescript
// 1. Process document
const chunks = chunkDocument(content);

// 2. Calculate tokens
const totalTokens = calculateTokens(content);

// 3. Calculate cost
const costPerToken = PRICING[embeddingModel];
const totalCost = totalTokens * costPerToken;

// 4. Update document record
await db.query(`
  UPDATE documents
  SET embedding_tokens_used = $1,
      embedding_cost_usd = $2,
      chunk_count = $3,
      character_count = $4,
      processing_time_ms = $5
  WHERE id = $6
`, [totalTokens, totalCost, chunks.length, content.length, processingTime, documentId]);

// 5. Track in usage_metrics
await trackMetric(customerId, documentId, 'embedding_tokens', totalTokens, totalCost, {
  model: embeddingModel,
  chunks: chunks.length,
  processing_time_ms: processingTime
});
```

### Search Query Tracking
```typescript
// Track token usage from search queries (if using OpenAI for query embedding)
await trackMetric(customerId, null, 'search_query', queryTokens, queryCost, {
  query: searchQuery,
  results_returned: results.length
});
```

---

## 📊 Reporting Queries

### Monthly Cost Report
```sql
SELECT
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as documents,
  SUM(embedding_tokens_used) as total_tokens,
  SUM(embedding_cost_usd) as total_cost
FROM documents
WHERE customer_id = $1
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;
```

### Cost by Document Type
```sql
SELECT
  doc_type,
  COUNT(*) as count,
  SUM(embedding_tokens_used) as total_tokens,
  SUM(embedding_cost_usd) as total_cost,
  AVG(embedding_tokens_used) as avg_tokens
FROM documents
WHERE customer_id = $1 AND status = 'completed'
GROUP BY doc_type
ORDER BY total_cost DESC;
```

### Daily Token Usage Trend
```sql
SELECT
  DATE(created_at) as date,
  SUM(embedding_tokens_used) as tokens,
  SUM(embedding_cost_usd) as cost,
  COUNT(*) as documents
FROM documents
WHERE customer_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## 🚨 Cost Alerts & Limits

### Implementation Strategy

#### 1. Set Budget Limits
```sql
ALTER TABLE customer_config
ADD COLUMN monthly_budget_usd DECIMAL(10, 2) DEFAULT 100.00,
ADD COLUMN budget_alert_threshold DECIMAL(3, 2) DEFAULT 0.80; -- Alert at 80%
```

#### 2. Check Budget Before Processing
```typescript
async function checkBudget(customerId: string): Promise<boolean> {
  const result = await db.query(`
    SELECT
      cc.monthly_budget_usd,
      cc.budget_alert_threshold,
      COALESCE(SUM(d.embedding_cost_usd), 0) as current_spending
    FROM customer_config cc
    LEFT JOIN documents d ON d.customer_id = cc.customer_id
      AND d.created_at >= DATE_TRUNC('month', NOW())
    WHERE cc.customer_id = $1
    GROUP BY cc.customer_id, cc.monthly_budget_usd, cc.budget_alert_threshold
  `, [customerId]);

  const { monthly_budget_usd, budget_alert_threshold, current_spending } = result.rows[0];

  if (current_spending >= monthly_budget_usd) {
    throw new Error('Monthly budget exceeded');
  }

  if (current_spending >= (monthly_budget_usd * budget_alert_threshold)) {
    // Send alert email
    await sendBudgetAlert(customerId, current_spending, monthly_budget_usd);
  }

  return true;
}
```

#### 3. Budget Alert Email
```typescript
async function sendBudgetAlert(customerId: string, current: number, budget: number) {
  const percentage = (current / budget * 100).toFixed(0);

  await sendEmail({
    to: customer.email,
    subject: `Budget Alert: ${percentage}% of monthly limit reached`,
    body: `
      You've used $${current.toFixed(2)} of your $${budget.toFixed(2)} monthly budget.
      Current usage: ${percentage}%
    `
  });
}
```

---

## 📋 Admin Actions

### Suspend High-Cost Customer
```typescript
// POST /api/admin/customers/:id/suspend
async function suspendCustomer(customerId: string, reason: string) {
  await db.query(`
    UPDATE customers
    SET status = 'suspended',
        updated_at = NOW()
    WHERE id = $1
  `, [customerId]);

  // Log action
  await db.query(`
    INSERT INTO admin_actions (customer_id, action, reason, timestamp)
    VALUES ($1, 'suspend', $2, NOW())
  `, [customerId, reason]);
}
```

### Export Customer Usage Report
```typescript
// GET /api/admin/customers/:id/usage/export
async function exportCustomerUsage(customerId: string, format: 'csv' | 'json') {
  const data = await db.query(`
    SELECT
      d.title,
      d.doc_type,
      d.embedding_tokens_used,
      d.embedding_cost_usd,
      d.created_at
    FROM documents d
    WHERE d.customer_id = $1
    ORDER BY d.created_at DESC
  `, [customerId]);

  if (format === 'csv') {
    return convertToCSV(data.rows);
  }
  return data.rows;
}
```

---

## 🎯 Best Practices

### 1. Accurate Token Counting
Use `tiktoken` for production:
```typescript
import { encoding_for_model } from '@dqbd/tiktoken';

function calculateTokensAccurate(text: string, model: string = 'text-embedding-3-small'): number {
  const enc = encoding_for_model(model);
  const tokens = enc.encode(text);
  enc.free();
  return tokens.length;
}
```

### 2. Cache Embeddings
Don't re-embed unchanged documents:
```typescript
// Check content hash before processing
const existingVersion = await db.query(
  'SELECT * FROM document_versions WHERE document_id = $1 AND content_hash = $2',
  [documentId, contentHash]
);

if (existingVersion.rows.length > 0) {
  return { isDuplicate: true, tokensUsed: 0, cost: 0 };
}
```

### 3. Batch Processing
Process multiple chunks in single API call:
```typescript
// Instead of: chunks.forEach(c => embed(c))
// Do: embedBatch(chunks) - saves on API overhead
```

### 4. Monitor Anomalies
Alert on unusual token usage:
```typescript
const avgTokens = await getAverageTokensPerDocument(customerId);
if (documentTokens > avgTokens * 5) {
  await sendAnomalyAlert(customerId, documentId);
}
```

---

## 🔍 Monitoring Dashboard KPIs

### Customer View
1. **Monthly Cost**: Current month spending
2. **Token Efficiency**: Avg tokens per document
3. **Budget Status**: % of budget used
4. **Cost Trend**: 30-day cost chart

### Admin View
1. **System Revenue**: Total customer spending
2. **Cost per Customer**: Average monthly cost
3. **Growth Rate**: Month-over-month increase
4. **Efficiency**: Avg processing time & tokens

---

## ✅ Implementation Checklist

- [x] Database schema updated with token tracking fields
- [x] Cost calculation functions implemented
- [x] Token counting logic (basic and tiktoken)
- [x] API endpoints for metrics
- [x] Customer dashboard with cost display
- [x] Admin dashboard with global metrics
- [x] Document processing tracks tokens
- [x] Search queries track tokens (if applicable)
- [ ] Budget limits and alerts
- [ ] Email notifications for budget warnings
- [ ] CSV export functionality
- [ ] Anomaly detection
- [ ] Cost optimization recommendations

---

## 🚀 Future Enhancements

1. **Predictive Budgeting**: ML model to predict monthly costs
2. **Cost Optimization**: Suggest cheaper embedding models for non-critical docs
3. **Token Compression**: Identify redundant content before embedding
4. **Real-time Alerts**: WebSocket notifications for budget thresholds
5. **Billing Integration**: Stripe/PayPal for automated billing
6. **Cost Comparison**: Show cost savings vs other embedding providers
