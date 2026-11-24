import type { Ack, ClientToServerEvents, ServerToClientEvents } from '@lineup/protocol';
import { STORAGE_KEYS } from '@lineup/shared-config';
import { io, type Socket } from 'socket.io-client';
import { describeEvents, errorText } from './text';
import { resetRoom, setUi, showToast, useStore } from './store';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode: ignore */
    }
  },
};

/** Lazily creates the single Socket.IO connection (auto-reconnect is Socket.IO's default). */
export function getSocket(): AppSocket {
  if (socket) return socket;
  const s: AppSocket = io({
    auth: (cb) => cb({ token: storage.get(STORAGE_KEYS.token) ?? undefined }),
    transports: ['websocket', 'polling'],
  });
  socket = s;
  useStore.setState({ connection: 'connecting' });

  s.on('connect', () => useStore.setState({ connection: 'connected' }));
  s.on('disconnect', () => useStore.setState({ connection: 'disconnected' }));
  s.io.on('reconnect_attempt', () => useStore.setState({ connection: 'disconnected' }));

  s.on('session:init', ({ playerId, token }) => {
    storage.set(STORAGE_KEYS.token, token);
    useStore.setState({ session: { playerId } });
  });
  s.on('room:state', (room) => {
    const prev = useStore.getState().room;
    useStore.setState({ room, session: { playerId: room.you } });
    if (room.phase === 'lobby' && prev?.phase !== 'lobby') {
      useStore.setState((st) => ({ game: { ...st.game, view: null, lastEvents: [] } }));
    }
  });
  s.on('game:update', ({ view, events, turnDeadline, serverNow }) => {
    const st = useStore.getState();
    const lines = describeEvents(events, st.room, view);
    const selected = st.ui.selectedCard;
    useStore.setState({
      game: {
        view,
        lastEvents: events,
        turnDeadline,
        clockOffset: serverNow - Date.now(),
        seq: st.game.seq + 1,
      },
      log: lines.length ? [...lines.reverse(), ...st.log].slice(0, 50) : st.log,
      ui: {
        ...st.ui,
        // keep the selection only while the selected card still exists
        selectedCard:
          selected !== null && selected < view.hand.length && events.length === 0 ? selected : null,
        previewCell: null,
        announcement: lines.length ? lines.slice(-2).join(' ') : st.ui.announcement,
      },
    });
  });
  s.on('chat:history', (chat) => useStore.setState({ chat }));
  s.on('chat:message', (m) => useStore.setState((st) => ({ chat: [...st.chat, m].slice(-100) })));
  s.on('error', ({ code, message }) => {
    if (code === 'NOT_IN_ROOM' && message) {
      resetRoom();
      setUi({ announcement: message });
    }
    showToast(errorText(code, message));
  });
  s.on('server:shutdown', () => {
    setUi({ shutdown: true });
    showToast('The server is restarting. Reconnecting…');
  });

  // Exposed for debugging and end-to-end tests. Holds no secrets beyond what this tab owns.
  (window as unknown as { __lineupSocket?: AppSocket }).__lineupSocket = s;
  return s;
}

/** Emits with an ack and a timeout. */
export async function request<T extends object = object>(
  event: keyof ClientToServerEvents,
  payload: object = {},
): Promise<Ack<T>> {
  const s = getSocket();
  try {
    const emit = s.timeout(8000) as unknown as {
      emitWithAck: (event: string, payload: object) => Promise<Ack<T>>;
    };
    return await emit.emitWithAck(event, payload);
  } catch {
    return {
      ok: false,
      code: 'INTERNAL',
      message: 'The server did not respond. Check your connection.',
    };
  }
}

/** Like `request`, but shows a toast on failure. */
export async function act<T extends object = object>(
  event: keyof ClientToServerEvents,
  payload: object = {},
): Promise<Ack<T>> {
  const res = await request<T>(event, payload);
  if (!res.ok) showToast(errorText(res.code, res.message));
  return res;
}
