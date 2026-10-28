export interface Config {
  databaseUrl: string;
  port: number;
  host: string;
  eulerApiKey: string | undefined;
  production: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required (see .env.example)');
  return {
    databaseUrl,
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '127.0.0.1',
    eulerApiKey: env.EULER_API_KEY || undefined,
    production: env.NODE_ENV === 'production',
  };
}
