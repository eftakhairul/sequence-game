import type { ChatMessage, RoomState } from '@lineup/protocol';
import type { GameEvent, PlayerView } from '@lineup/rules';
import { create } from 'zustand';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

export interface StoreState {
  connection: ConnectionStatus;
  session: { playerId: string } | null;
  room: RoomState | null;
  game: {
    view: PlayerView | null;
    lastEvents: GameEvent[];
    turnDeadline: number | null;
    /** serverNow - clientNow at the time of the last update (ms). */
    clockOffset: number;
    /** increments with every game:update so animations can key on it */
    seq: number;
  };
  chat: ChatMessage[];
  log: string[];
  ui: {
    /** index into view.hand (hands can contain duplicate cards) */
    selectedCard: number | null;
    previewCell: number | null;
    announcement: string;
    toast: { id: number; text: string } | null;
    shutdown: boolean;
    /** code of a room the host removed this player from (stops auto-rejoin) */
    removedFrom: string | null;
  };
}

export const initialState: StoreState = {
  connection: 'idle',
  session: null,
  room: null,
  game: { view: null, lastEvents: [], turnDeadline: null, clockOffset: 0, seq: 0 },
  chat: [],
  log: [],
  ui: {
    selectedCard: null,
    previewCell: null,
    announcement: '',
    toast: null,
    shutdown: false,
    removedFrom: null,
  },
};

export const useStore = create<StoreState>(() => initialState);

export const setUi = (patch: Partial<StoreState['ui']>) =>
  useStore.setState((s) => ({ ui: { ...s.ui, ...patch } }));

let toastId = 0;
export function showToast(text: string): void {
  const id = ++toastId;
  setUi({ toast: { id, text } });
  setTimeout(() => {
    if (useStore.getState().ui.toast?.id === id) setUi({ toast: null });
  }, 4000);
}

export function resetRoom(): void {
  useStore.setState({
    room: null,
    game: { ...initialState.game },
    chat: [],
    log: [],
    ui: { ...useStore.getState().ui, selectedCard: null, previewCell: null },
  });
}
