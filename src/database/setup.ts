#!/usr/bin/env tsx
import { pool, query } from './connection.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const SALT_ROUNDS = 10;

function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

async function setupDatabase() {
  console.log('🚀 Setting up Dynamic RAG database...\n');

  try {
    // 1. Run migrations first
    console.log('📋 Step 1: Running migrations...');
    const { execSync } = require('child_process');
    execSync('npm run migrate', { stdio: 'inherit' });

    // 2. Create admin user
    console.log('\n👤 Step 2: Creating admin user...');

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeThisPassword123!';
    const adminCompany = 'Dynamic RAG Admin';

    // Check if admin already exists
    const existingAdmin = await query(
      'SELECT id FROM customers WHERE email = $1',
      [adminEmail]
    );

    if (existingAdmin.rows.length > 0) {
      console.log(`⚠️  Admin user already exists: ${adminEmail}`);
    } else {
      // Hash password
      const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
      const apiKey = generateApiKey();

      // Insert admin customer
      const customerResult = await query(
        `INSERT INTO customers (email, password_hash, company_name, api_key, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING id, email, api_key`,
        [adminEmail, passwordHash, adminCompany, apiKey]
      );

      const customerId = customerResult.rows[0].id;

      // Create default config for admin
      await query(
        `INSERT INTO customer_config (customer_id)
         VALUES ($1)`,
        [customerId]
      );

      console.log('\n✅ Admin user created successfully!');
      console.log('   =====================================');
      console.log(`   Email:   ${adminEmail}`);
      console.log(`   Password: ${adminPassword}`);
      console.log(`   API Key: ${apiKey}`);
      console.log('   =====================================');
      console.log('   ⚠️  IMPORTANT: Change the password after first login!');
    }

    // 3. Display summary
    console.log('\n📊 Database Summary:');
    const customerCount = await query('SELECT COUNT(*) as count FROM customers');
    const docCount = await query('SELECT COUNT(*) as count FROM documents');

    console.log(`   Customers: ${customerCount.rows[0].count}`);
    console.log(`   Documents: ${docCount.rows[0].count}`);

    console.log('\n✅ Database setup completed successfully!');
    console.log('\n🚀 Next steps:');
    console.log('   1. Copy .env.example to .env and configure');
    console.log('   2. Update admin password from defaults');
    console.log('   3. Start the server: npm run dev');

  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run setup
setupDatabase();
