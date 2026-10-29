export interface Config {
  databaseUrl: string;
  port: number;
  host: string;
  eulerApiKey: string | undefined;
  production: boolean;
  secureCookies: boolean;
  piperBin: string | undefined;
  piperVoicesDir: string | undefined;
  tiktokSessionId: string | undefined;
  secretsKey: Buffer;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required (see .env.example)');
  // Encrypts hosts' API keys and TikTok sessions in the database. Losing it means hosts re-enter them.
  const secretsKey = Buffer.from(env.SECRETS_KEY ?? '', 'base64');
  if (secretsKey.length !== 32) {
    throw new Error('SECRETS_KEY must be 32 random bytes in base64. Generate one with: openssl rand -base64 32');
  }
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
    // Optional: a TikTok account's sessionid cookie, used for TikTok voices by every host who hasn't signed in themselves.
    tiktokSessionId: env.TIKTOK_SESSION_ID || undefined,
    secretsKey,
  };
}
