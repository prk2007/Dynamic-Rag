import { query } from '../database/connection.js';
import { hashPassword } from '../auth/password.js';
import { generateApiKey, encrypt, decrypt } from '../auth/encryption.js';
import crypto from 'crypto';

export interface Customer {
  id: string;
  email: string;
  password_hash: string;
  company_name: string | null;
  api_key: string;
  openai_api_key: string | null;
  jwt_secret: string; // Encrypted
  jwt_refresh_secret: string; // Encrypted
  status: 'active' | 'suspended' | 'deleted';
  created_at: Date;
  updated_at: Date;
}

/**
 * Generate unique JWT secret for customer
 */
function generateJWTSecret(): string {
  return crypto.randomBytes(64).toString('hex');
}

export interface CustomerConfig {
  id: number;
  customer_id: string;
  rate_limit_requests_per_minute: number;
  rate_limit_requests_per_day: number;
  max_documents: number;
  max_file_size_mb: number;
  allowed_document_types: string[];
  chunking_size: number;
  chunking_overlap: number;
  embedding_model: string;
  monthly_budget_usd: number;
  budget_alert_threshold: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCustomerData {
  email: string;
  password: string;
  company_name?: string;
  openai_api_key?: string;
}

/**
 * Create a new customer
 */
export async function createCustomer(data: CreateCustomerData): Promise<Customer> {
  const { email, password, company_name, openai_api_key } = data;

  // Hash password
  const password_hash = await hashPassword(password);

  // Generate API key
  const api_key = generateApiKey();

  // Generate unique JWT secrets for this customer
  const jwt_secret = generateJWTSecret();
  const jwt_refresh_secret = generateJWTSecret();

  // Encrypt secrets
  const encrypted_jwt_secret = encrypt(jwt_secret);
  const encrypted_jwt_refresh_secret = encrypt(jwt_refresh_secret);

  // Encrypt OpenAI key if provided
  const encrypted_openai_key = openai_api_key ? encrypt(openai_api_key) : null;

  // Insert customer
  const result = await query<Customer>(
    `INSERT INTO customers (email, password_hash, company_name, api_key, openai_api_key, jwt_secret, jwt_refresh_secret, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
     RETURNING *`,
    [email, password_hash, company_name || null, api_key, encrypted_openai_key, encrypted_jwt_secret, encrypted_jwt_refresh_secret]
  );

  const customer = result.rows[0];

  // Create default config
  await query(
    `INSERT INTO customer_config (customer_id) VALUES ($1)`,
    [customer.id]
  );

  return customer;
}

/**
 * Find customer by email
 */
export async function findCustomerByEmail(email: string): Promise<Customer | null> {
  const result = await query<Customer>(
    `SELECT * FROM customers WHERE email = $1 AND status != 'deleted'`,
    [email]
  );

  return result.rows[0] || null;
}

/**
 * Find customer by ID
 */
export async function findCustomerById(id: string): Promise<Customer | null> {
  const result = await query<Customer>(
    `SELECT * FROM customers WHERE id = $1 AND status != 'deleted'`,
    [id]
  );

  return result.rows[0] || null;
}

/**
 * Find customer by API key
 */
export async function findCustomerByApiKey(apiKey: string): Promise<Customer | null> {
  const result = await query<Customer>(
    `SELECT * FROM customers WHERE api_key = $1 AND status = 'active'`,
    [apiKey]
  );

  return result.rows[0] || null;
}

/**
 * Get customer config
 */
export async function getCustomerConfig(customerId: string): Promise<CustomerConfig | null> {
  const result = await query<CustomerConfig>(
    `SELECT * FROM customer_config WHERE customer_id = $1`,
    [customerId]
  );

  return result.rows[0] || null;
}

/**
 * Update customer config
 */
export async function updateCustomerConfig(
  customerId: string,
  updates: Partial<CustomerConfig>
): Promise<CustomerConfig> {
  const fields = Object.keys(updates)
    .filter((key) => key !== 'id' && key !== 'customer_id')
    .map((key, index) => `${key} = $${index + 2}`)
    .join(', ');

  const values = Object.keys(updates)
    .filter((key) => key !== 'id' && key !== 'customer_id')
    .map((key) => updates[key as keyof CustomerConfig]);

  const result = await query<CustomerConfig>(
    `UPDATE customer_config
     SET ${fields}
     WHERE customer_id = $1
     RETURNING *`,
    [customerId, ...values]
  );

  return result.rows[0];
}

/**
 * Update customer OpenAI key
 */
export async function updateCustomerOpenAIKey(
  customerId: string,
  openaiKey: string
): Promise<void> {
  const encrypted = encrypt(openaiKey);

  await query(
    `UPDATE customers SET openai_api_key = $1, updated_at = NOW() WHERE id = $2`,
    [encrypted, customerId]
  );
}

/**
 * Get decrypted OpenAI key for customer
 */
export async function getCustomerOpenAIKey(customerId: string): Promise<string | null> {
  const result = await query<{ openai_api_key: string | null }>(
    `SELECT openai_api_key FROM customers WHERE id = $1`,
    [customerId]
  );

  const encryptedKey = result.rows[0]?.openai_api_key;
  if (!encryptedKey) return null;

  return decrypt(encryptedKey);
}

/**
 * Get decrypted JWT secrets for customer
 */
export async function getCustomerJWTSecrets(customerId: string): Promise<{
  jwtSecret: string;
  jwtRefreshSecret: string;
}> {
  const result = await query<{ jwt_secret: string; jwt_refresh_secret: string }>(
    `SELECT jwt_secret, jwt_refresh_secret FROM customers WHERE id = $1`,
    [customerId]
  );

  if (result.rows.length === 0) {
    throw new Error('Customer not found');
  }

  const { jwt_secret, jwt_refresh_secret } = result.rows[0];

  return {
    jwtSecret: decrypt(jwt_secret),
    jwtRefreshSecret: decrypt(jwt_refresh_secret),
  };
}

/**
 * Regenerate API key
 */
export async function regenerateApiKey(customerId: string): Promise<string> {
  const newApiKey = generateApiKey();

  await query(
    `UPDATE customers SET api_key = $1, updated_at = NOW() WHERE id = $2`,
    [newApiKey, customerId]
  );

  return newApiKey;
}

/**
 * Suspend customer
 */
export async function suspendCustomer(customerId: string): Promise<void> {
  await query(
    `UPDATE customers SET status = 'suspended', updated_at = NOW() WHERE id = $1`,
    [customerId]
  );
}

/**
 * Activate customer
 */
export async function activateCustomer(customerId: string): Promise<void> {
  await query(
    `UPDATE customers SET status = 'active', updated_at = NOW() WHERE id = $1`,
    [customerId]
  );
}

/**
 * Delete customer (soft delete)
 */
export async function deleteCustomer(customerId: string): Promise<void> {
  await query(
    `UPDATE customers SET status = 'deleted', updated_at = NOW() WHERE id = $1`,
    [customerId]
  );
}
