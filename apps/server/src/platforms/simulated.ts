import type { RoomStats, ViewerEvent } from '@fluxion/shared';
import type { PlatformAdapter } from './types.js';

// Lets a host test their setup from the dashboard without going live.
export class SimulatedAdapter implements PlatformAdapter {
  private listener: (event: ViewerEvent) => void = () => {};
  private statsListener: (stats: RoomStats) => void = () => {};

  async start() {}
  async stop() {}
  onEvent(listener: (event: ViewerEvent) => void) {
    this.listener = listener;
  }
  onEnd() {}
  onRoomStats(listener: (stats: RoomStats) => void) {
    this.statsListener = listener;
  }

  inject(event: ViewerEvent) {
    this.listener(event);
  }

  injectStats(stats: RoomStats) {
    this.statsListener(stats);
  }
}
