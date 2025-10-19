/**
 * Welcome Email Template
 * Sent after successful email verification
 */

export interface WelcomeEmailData {
  email: string;
  companyName?: string;
  dashboardUrl: string;
  apiKey: string;
}

export function generateWelcomeEmail(data: WelcomeEmailData): string {
  const { email, companyName, dashboardUrl, apiKey } = data;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Dynamic RAG</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f4f4f4;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #ffffff;
    }
    .header {
      text-align: center;
      padding: 20px 0;
      border-bottom: 2px solid #10B981;
    }
    .header h1 {
      color: #10B981;
      margin: 0;
      font-size: 28px;
    }
    .content {
      padding: 30px 20px;
    }
    .content h2 {
      color: #333;
      font-size: 24px;
      margin-bottom: 20px;
    }
    .content p {
      margin-bottom: 15px;
      font-size: 16px;
    }
    .success-badge {
      text-align: center;
      padding: 20px;
      margin: 20px 0;
    }
    .success-badge span {
      display: inline-block;
      padding: 10px 20px;
      background-color: #D1FAE5;
      color: #065F46;
      border-radius: 20px;
      font-weight: 600;
      font-size: 14px;
    }
    .api-key-box {
      margin: 20px 0;
      padding: 20px;
      background-color: #f9fafb;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
    }
    .api-key-box h3 {
      margin: 0 0 10px 0;
      color: #374151;
      font-size: 16px;
    }
    .api-key-box code {
      display: block;
      padding: 12px;
      background-color: #1F2937;
      color: #10B981;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      word-break: break-all;
      margin: 10px 0;
    }
    .api-key-box .warning {
      font-size: 13px;
      color: #DC2626;
      margin-top: 10px;
    }
    .button-container {
      text-align: center;
      margin: 30px 0;
    }
    .dashboard-button {
      display: inline-block;
      padding: 14px 36px;
      background-color: #10B981;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
    }
    .dashboard-button:hover {
      background-color: #059669;
    }
    .features-grid {
      margin: 30px 0;
      display: grid;
      grid-template-columns: 1fr;
      gap: 15px;
    }
    .feature-card {
      padding: 15px;
      background-color: #F0FDF4;
      border-left: 4px solid #10B981;
      border-radius: 4px;
    }
    .feature-card h4 {
      margin: 0 0 8px 0;
      color: #065F46;
      font-size: 16px;
    }
    .feature-card p {
      margin: 0;
      font-size: 14px;
      color: #047857;
    }
    .next-steps {
      margin: 30px 0;
      padding: 20px;
      background-color: #EFF6FF;
      border-radius: 8px;
    }
    .next-steps h3 {
      margin: 0 0 15px 0;
      color: #1E40AF;
      font-size: 18px;
    }
    .next-steps ol {
      margin: 0;
      padding-left: 20px;
    }
    .next-steps li {
      margin-bottom: 10px;
      color: #1E3A8A;
    }
    .footer {
      padding: 20px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
      color: #666;
      font-size: 14px;
    }
    .footer p {
      margin: 5px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Welcome to Dynamic RAG</h1>
    </div>

    <div class="success-badge">
      <span>✓ Email Verified Successfully</span>
    </div>

    <div class="content">
      <h2>Hello${companyName ? ` from ${companyName}` : ''}!</h2>

      <p>Congratulations! Your email address has been successfully verified, and your account is now fully active.</p>

      <p>You can now access all features of Dynamic RAG, including:</p>

      <div class="features-grid">
        <div class="feature-card">
          <h4>📄 Document Processing</h4>
          <p>Upload PDFs, text files, and web content for intelligent processing</p>
        </div>
        <div class="feature-card">
          <h4>🔍 Semantic Search</h4>
          <p>Perform context-aware searches across your document collection</p>
        </div>
        <div class="feature-card">
          <h4>🤖 RAG API</h4>
          <p>Integrate our retrieval-augmented generation API into your applications</p>
        </div>
        <div class="feature-card">
          <h4>⚙️ Custom Configuration</h4>
          <p>Configure chunking, embeddings, and search parameters</p>
        </div>
      </div>

      <div class="api-key-box">
        <h3>🔑 Your API Key</h3>
        <p>Use this key to authenticate your API requests:</p>
        <code>${apiKey}</code>
        <p class="warning">⚠️ Keep this key secure! Never share it publicly or commit it to version control.</p>
      </div>

      <div class="button-container">
        <a href="${dashboardUrl}" class="dashboard-button">Go to Dashboard</a>
      </div>

      <div class="next-steps">
        <h3>🚀 Next Steps</h3>
        <ol>
          <li><strong>Access your dashboard</strong> to view your account settings</li>
          <li><strong>Upload your first document</strong> to start building your knowledge base</li>
          <li><strong>Configure your settings</strong> (optional: add OpenAI API key for custom models)</li>
          <li><strong>Start querying</strong> using the RAG API with your API key</li>
        </ol>
      </div>

      <p style="margin-top: 30px;">Need help getting started? Check out our documentation or contact our support team.</p>
    </div>

    <div class="footer">
      <p>Dynamic RAG - Semantic Document Search Platform</p>
      <p>Account: ${email}</p>
      <p style="margin-top: 15px; font-size: 12px;">This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text version of welcome email
 */
export function generateWelcomeEmailText(data: WelcomeEmailData): string {
  const { email, companyName, dashboardUrl, apiKey } = data;

  return `
WELCOME TO DYNAMIC RAG

✓ Email Verified Successfully

Hello${companyName ? ` from ${companyName}` : ''}!

Congratulations! Your email address has been successfully verified, and your account is now fully active.

You can now access all features of Dynamic RAG, including:

📄 DOCUMENT PROCESSING
Upload PDFs, text files, and web content for intelligent processing

🔍 SEMANTIC SEARCH
Perform context-aware searches across your document collection

🤖 RAG API
Integrate our retrieval-augmented generation API into your applications

⚙️ CUSTOM CONFIGURATION
Configure chunking, embeddings, and search parameters

---

YOUR API KEY
Use this key to authenticate your API requests:

${apiKey}

⚠️ SECURITY WARNING: Keep this key secure! Never share it publicly or commit it to version control.

---

NEXT STEPS

1. Access your dashboard to view your account settings
   ${dashboardUrl}

2. Upload your first document to start building your knowledge base

3. Configure your settings (optional: add OpenAI API key for custom models)

4. Start querying using the RAG API with your API key

Need help getting started? Check out our documentation or contact our support team.

---
Dynamic RAG - Semantic Document Search Platform
Account: ${email}

This is an automated email. Please do not reply.
  `.trim();
}
