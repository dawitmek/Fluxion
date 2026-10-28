export interface Config {
  databaseUrl: string;
  port: number;
  host: string;
  eulerApiKey: string | undefined;
  production: boolean;
  secureCookies: boolean;
  piperBin: string | undefined;
  piperVoicesDir: string | undefined;
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
    // Secure cookies need HTTPS. Defaults on in production; COOKIE_SECURE=false allows plain HTTP on a LAN.
    secureCookies: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
    // Optional server-side TTS. The Docker image sets both; without them the Piper engine falls back to eSpeak.
    piperBin: env.PIPER_BIN || undefined,
    piperVoicesDir: env.PIPER_VOICES_DIR || undefined,
  };
}
