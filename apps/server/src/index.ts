import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { runMigrations } from './db/migrate.js';

const config = loadConfig();
await runMigrations(config.databaseUrl);
const app = await buildApp(config);
app.debug.write('server', null, 'started');
await app.live.closeAbandonedStreams();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void app.close());
}

await app.listen({ port: config.port, host: config.host });
