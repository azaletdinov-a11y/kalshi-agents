import { db } from './client';
import { readFileSync } from 'fs';
import { join } from 'path';

async function migrate() {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  await db.query(schema);
  console.log('Migration completed successfully');
  await db.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
