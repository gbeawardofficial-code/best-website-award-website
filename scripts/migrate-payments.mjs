import { readFile, readdir } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const sql = neon(process.env.DATABASE_URL);
const directory = new URL('../migrations/', import.meta.url);
for (const file of (await readdir(directory)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()) {
  const migration = await readFile(new URL(file, directory), 'utf8');
  await sql.transaction(
    migration
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean)
      .map((statement) => sql.query(statement))
  );
}
console.log('BWA payment schema applied. Existing application schemas were not modified.');
