import pg from 'pg';
import { readConfig } from './config.js';
import { buildApp } from './app.js';
const config = readConfig();
const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  connectionTimeoutMillis: 3000,
});
const app = buildApp(() => pool.query('SELECT 1'), true);
app.addHook('onClose', async () => {
  await pool.end();
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close();
  });
await app.listen({ port: config.PORT, host: config.HOST });
