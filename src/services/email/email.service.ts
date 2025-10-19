/**
 * Email Service - SendGrid Implementation
 * Handles all email sending operations
 */

import sgMail from '@sendgrid/mail';
import { EmailProvider, EmailOptions } from './email.interface.js';

class SendGridEmailService implements EmailProvider {
  private initialized = false;
  private readonly defaultFrom: string;
  private readonly defaultFromName: string;

  constructor() {
    this.defaultFrom = process.env.EMAIL_FROM || 'noreply@example.com';
    this.defaultFromName = process.env.EMAIL_FROM_NAME || 'Dynamic RAG';
    this.initialize();
  }

  private initialize(): void {
    const apiKey = process.env.SENDGRID_API_KEY;

    if (!apiKey) {
      console.warn('SENDGRID_API_KEY not configured. Email sending will fail.');
      return;
    }

    sgMail.setApiKey(apiKey);
    this.initialized = true;
    console.log('✅ SendGrid email service initialized');
  }

  async send(options: EmailOptions): Promise<void> {
    if (!this.initialized) {
      throw new Error('SendGrid not initialized. Please set SENDGRID_API_KEY environment variable.');
    }

    const from = options.from
      ? `${options.fromName || this.defaultFromName} <${options.from}>`
      : `${this.defaultFromName} <${this.defaultFrom}>`;

    const msg = {
      to: options.to,
      from,
      subject: options.subject,
      html: options.html,
      text: options.text || this.stripHtml(options.html),
    };

    try {
      await sgMail.send(msg);
      console.log(`✉️  Email sent to ${options.to}: ${options.subject}`);
    } catch (error: any) {
      console.error('Failed to send email:', error.response?.body || error.message);
      throw new Error(`Email sending failed: ${error.message}`);
    }
  }

  /**
   * Strip HTML tags to create plain text version
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }
}

// Export singleton instance
export const emailService: EmailProvider = new SendGridEmailService();
