import { getDb, migrate } from '../../lib/db.js';

await migrate(getDb());
console.log(`schema ready (${process.env.TURSO_DATABASE_URL || 'file:local.db'})`);
