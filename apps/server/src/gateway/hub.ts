import type { WebSocket } from 'ws';
import type { ServerToCompanion, ServerToOverlay } from '@fluxion/shared';

// Tracks open sockets per host. In-memory: one server process owns its hosts' sockets.
export class Hub {
  private companions = new Map<string, Map<string, WebSocket>>(); // hostId -> companionId -> socket
  private overlays = new Map<string, Set<WebSocket>>();

  addCompanion(hostId: string, companionId: string, socket: WebSocket) {
    let sockets = this.companions.get(hostId);
    if (!sockets) this.companions.set(hostId, (sockets = new Map()));
    sockets.get(companionId)?.close(4002, 'Replaced by a newer connection');
    sockets.set(companionId, socket);
    socket.on('close', () => {
      if (sockets.get(companionId) === socket) sockets.delete(companionId);
    });
  }

  addOverlay(hostId: string, socket: WebSocket) {
    let sockets = this.overlays.get(hostId);
    if (!sockets) this.overlays.set(hostId, (sockets = new Set()));
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  }

  companionCount(hostId: string) {
    return this.companions.get(hostId)?.size ?? 0;
  }

  disconnectCompanion(companionId: string) {
    for (const sockets of this.companions.values()) {
      sockets.get(companionId)?.close(4003, 'Companion revoked');
    }
  }

  sendToCompanions(hostId: string, message: ServerToCompanion) {
    send(this.companions.get(hostId)?.values(), message);
  }

  sendToOverlays(hostId: string, message: ServerToOverlay) {
    send(this.overlays.get(hostId)?.values(), message);
  }
}

function send(sockets: Iterable<WebSocket> | undefined, message: unknown) {
  if (!sockets) return;
  const data = JSON.stringify(message);
  for (const socket of sockets) socket.send(data);
}
