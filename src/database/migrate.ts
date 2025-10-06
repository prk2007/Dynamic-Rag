#!/usr/bin/env tsx
import { readFileSync } from 'fs';
import { join } from 'path';
import { pool, query, testConnection } from './connection.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  console.log('🔄 Running database migrations...\n');

  try {
    // Test connection first
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Database connection failed');
    }

    // Read schema file
    const schemaPath = join(__dirname, 'schema.sql');
    console.log(`📖 Reading schema from: ${schemaPath}`);
    const schema = readFileSync(schemaPath, 'utf8');

    // Execute schema
    console.log('⚙️  Executing schema...');
    await query(schema);
    console.log('✅ Schema executed successfully\n');

    // Verify tables
    console.log('🔍 Verifying tables...');
    const tablesResult = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log(`\n✅ Created ${tablesResult.rows.length} tables:`);
    tablesResult.rows.forEach((row: any) => {
      console.log(`   - ${row.table_name}`);
    });

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migrations
runMigrations();
