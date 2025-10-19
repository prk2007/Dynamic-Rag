/**
 * Email Service Interface
 * Provider-agnostic interface for email sending
 * Supports multiple providers (SendGrid, AWS SES, Resend, etc.)
 */

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  fromName?: string;
}

export interface EmailProvider {
  /**
   * Send an email
   * @param options Email options
   * @returns Promise that resolves when email is sent
   */
  send(options: EmailOptions): Promise<void>;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}
