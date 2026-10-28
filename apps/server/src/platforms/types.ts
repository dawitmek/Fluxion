import type { ViewerEvent } from '@fluxion/shared';

// One live connection to a streaming platform. Only adapters know platform details.
export interface PlatformAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(listener: (event: ViewerEvent) => void): void;
  onEnd(listener: (reason: string) => void): void;
}
