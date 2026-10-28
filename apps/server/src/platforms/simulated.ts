import type { ViewerEvent } from '@fluxion/shared';
import type { PlatformAdapter } from './types.js';

// Lets a host test their setup from the dashboard without going live.
export class SimulatedAdapter implements PlatformAdapter {
  private listener: (event: ViewerEvent) => void = () => {};

  async start() {}
  async stop() {}
  onEvent(listener: (event: ViewerEvent) => void) {
    this.listener = listener;
  }
  onEnd() {}

  inject(event: ViewerEvent) {
    this.listener(event);
  }
}
