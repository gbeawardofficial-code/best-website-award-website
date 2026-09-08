import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const sql = neon(process.env.DATABASE_URL);
const migration = await readFile(
  new URL('../migrations/001_nomination_payments.sql', import.meta.url),
  'utf8'
);
// This migration only creates the dedicated bwa schema and its payment objects.
await sql.transaction(
  migration
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => sql.query(statement))
);
console.log('BWA payment schema applied. Existing application schemas were not modified.');
