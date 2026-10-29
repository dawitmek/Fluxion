import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { serviceStatus } from '../db/schema.js';
import { SIGNED_OUT, synthesizeTiktok, TiktokError } from './tiktok.js';

const STATUS_NAME = 'tiktok-account';
const CHECK_EVERY_MS = 60 * 60 * 1000;

export type TiktokAccountState = 'none' | 'ok' | 'offline';

// The server-wide TikTok account (TIKTOK_SESSION_ID) that hosts' TikTok voices use unless they sign in themselves.
// Its health is kept in the database: checked at startup, every hour, and whenever a line is spoken with it.
// Only TikTok refusing the session marks it offline; a network failure says nothing about the session.
export class ServerTiktokAccount {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private db: Db,
    readonly session: string | undefined,
    private fetchImpl: typeof fetch,
    private onError: (err: unknown) => void = () => {},
  ) {}

  start() {
    if (!this.session) return;
    void this.check();
    this.timer = setInterval(() => void this.check(), CHECK_EVERY_MS).unref();
  }

  stop() {
    clearInterval(this.timer);
  }

  async check() {
    if (!this.session) return;
    try {
      await synthesizeTiktok({ session: this.session, voice: null }, 'test', this.fetchImpl);
      await this.record(true);
    } catch (err) {
      await this.recordFailure(err);
    }
  }

  // Called after each line spoken with this account. Always written: another server process may have changed it.
  async record(ok: boolean, detail: string | null = null) {
    await this.db
      .insert(serviceStatus)
      .values({ name: STATUS_NAME, ok, detail, checkedAt: new Date() })
      .onConflictDoUpdate({ target: serviceStatus.name, set: { ok, detail, checkedAt: new Date() } })
      .catch(this.onError);
  }

  async recordFailure(err: unknown) {
    if (err instanceof TiktokError && err.code === SIGNED_OUT) await this.record(false, err.message);
  }

  async state(): Promise<TiktokAccountState> {
    if (!this.session) return 'none';
    const [row] = await this.db.select({ ok: serviceStatus.ok }).from(serviceStatus).where(eq(serviceStatus.name, STATUS_NAME));
    // Not checked yet: assume it works until TikTok says otherwise.
    return row?.ok === false ? 'offline' : 'ok';
  }
}
