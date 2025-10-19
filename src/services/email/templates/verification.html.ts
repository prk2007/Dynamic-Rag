/**
 * Email Verification Template
 * Generates HTML email for email verification
 */

export interface VerificationEmailData {
  email: string;
  verificationUrl: string;
  companyName?: string;
}

export function generateVerificationEmail(data: VerificationEmailData): string {
  const { email, verificationUrl, companyName } = data;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
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
      border-bottom: 2px solid #4F46E5;
    }
    .header h1 {
      color: #4F46E5;
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
    .button-container {
      text-align: center;
      margin: 30px 0;
    }
    .verify-button {
      display: inline-block;
      padding: 14px 36px;
      background-color: #4F46E5;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
    }
    .verify-button:hover {
      background-color: #4338CA;
    }
    .alternative-link {
      margin-top: 20px;
      padding: 15px;
      background-color: #f9fafb;
      border-radius: 6px;
      word-break: break-all;
    }
    .alternative-link p {
      margin: 5px 0;
      font-size: 14px;
      color: #666;
    }
    .alternative-link a {
      color: #4F46E5;
      text-decoration: none;
      font-size: 12px;
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
    .security-note {
      margin-top: 30px;
      padding: 15px;
      background-color: #FEF3C7;
      border-left: 4px solid #F59E0B;
      border-radius: 4px;
    }
    .security-note p {
      margin: 5px 0;
      font-size: 14px;
      color: #92400E;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Dynamic RAG</h1>
    </div>

    <div class="content">
      <h2>Verify Your Email Address</h2>

      <p>Hello${companyName ? ` from ${companyName}` : ''},</p>

      <p>Thank you for signing up for Dynamic RAG! To complete your registration and start using our services, please verify your email address by clicking the button below:</p>

      <div class="button-container">
        <a href="${verificationUrl}" class="verify-button">Verify Email Address</a>
      </div>

      <div class="alternative-link">
        <p>Or copy and paste this link into your browser:</p>
        <a href="${verificationUrl}">${verificationUrl}</a>
      </div>

      <div class="security-note">
        <p><strong>Security Note:</strong></p>
        <p>• This link will expire in 24 hours</p>
        <p>• If you didn't create an account, please ignore this email</p>
        <p>• Never share this link with anyone</p>
      </div>

      <p style="margin-top: 30px;">Once verified, you'll be able to:</p>
      <ul>
        <li>Access your account dashboard</li>
        <li>Upload and process documents</li>
        <li>Use our RAG API for semantic search</li>
        <li>Configure your personal settings</li>
      </ul>

      <p style="margin-top: 20px;">If you have any questions, feel free to reach out to our support team.</p>
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
 * Generate plain text version of verification email
 */
export function generateVerificationEmailText(data: VerificationEmailData): string {
  const { email, verificationUrl, companyName } = data;

  return `
VERIFY YOUR EMAIL ADDRESS

Hello${companyName ? ` from ${companyName}` : ''},

Thank you for signing up for Dynamic RAG! To complete your registration and start using our services, please verify your email address.

Verification Link:
${verificationUrl}

SECURITY NOTE:
• This link will expire in 24 hours
• If you didn't create an account, please ignore this email
• Never share this link with anyone

Once verified, you'll be able to:
• Access your account dashboard
• Upload and process documents
• Use our RAG API for semantic search
• Configure your personal settings

If you have any questions, feel free to reach out to our support team.

---
Dynamic RAG - Semantic Document Search Platform
Account: ${email}

This is an automated email. Please do not reply.
  `.trim();
}
