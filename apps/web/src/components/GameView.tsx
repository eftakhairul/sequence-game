import type { ClientAction, RoomState } from '@lineup/protocol';
import {
  isCutter,
  isDeadFromView,
  legalTargetsFromView,
  teamOf,
  type Card,
  type PlayerView,
} from '@lineup/rules';
import { useMemo } from 'react';
import { setUi, useStore } from '../store';
import { teamName } from '../text';
import { Board, lineKey } from './Board';
import { Chat } from './Chat';
import { TeamGlyph } from './Chip';
import { Hand } from './Hand';
import { PlayersPanel } from './PlayersPanel';
import { StatusBar } from './StatusBar';
import { useMediaQuery } from './useMediaQuery';

export interface GameViewProps {
  room: RoomState;
  view: PlayerView;
  onAction: (a: ClientAction) => void;
  onSendChat: (text: string) => Promise<boolean>;
  onRematch: () => void;
  onStart: () => void;
}

export function GameView({ room, view, onAction, onSendChat, onRematch, onStart }: GameViewProps) {
  const { lastEvents, turnDeadline, clockOffset } = useStore((s) => s.game);
  const ui = useStore((s) => s.ui);
  const chat = useStore((s) => s.chat);
  const log = useStore((s) => s.log);
  const me = room.you;
  const finished = view.status !== 'playing';
  const myTurn = !finished && view.you !== null && view.currentSeat === view.you;
  const selectedCard: Card | null =
    ui.selectedCard !== null ? (view.hand[ui.selectedCard] ?? null) : null;
  const targets = useMemo(
    () => (selectedCard && !finished ? legalTargetsFromView(view, selectedCard) : null),
    [selectedCard, view, finished],
  );
  const dead = useMemo(() => view.hand.map((c) => isDeadFromView(view, c)), [view]);
  const freshCells = useMemo(
    () => new Set(lastEvents.flatMap((e) => (e.type === 'chipPlaced' ? [e.cell] : []))),
    [lastEvents],
  );
  const freshLines = useMemo(
    () => new Set(lastEvents.flatMap((e) => (e.type === 'lineMade' ? [lineKey(e.line)] : []))),
    [lastEvents],
  );
  const myTeam = view.you !== null ? teamOf(view.you, view.config) : null;

  const activate = (cell: number, viaTouch: boolean) => {
    if (!selectedCard || !myTurn) return;
    if (viaTouch && ui.previewCell !== cell) {
      setUi({ previewCell: cell });
      return;
    }
    onAction({ type: isCutter(selectedCard) ? 'cut' : 'play', card: selectedCard, cell });
    setUi({ selectedCard: null, previewCell: null });
  };

  const isHost = room.hostId === me;
  const desktop = useMediaQuery('(min-width: 1024px)');
  const showHand = !finished && view.you !== null;

  return (
    <div
      className={`mx-auto flex w-full max-w-[1400px] flex-col gap-3 p-2 ${showHand && !desktop ? 'pb-36' : 'pb-4'} lg:flex-row lg:items-start lg:justify-center`}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="w-full">
          <StatusBar
            room={room}
            view={view}
            turnDeadline={turnDeadline}
            clockOffset={clockOffset}
          />
        </div>
        {finished && (
          <div className="panel w-full p-4 text-center" role="status" data-testid="result-banner">
            <p className="flex items-center justify-center gap-2 text-2xl font-black">
              {view.status === 'draw' ? (
                'Draw'
              ) : (
                <>
                  <TeamGlyph team={view.winner ?? 0} className="h-7 w-7" />
                  {teamName(view.winner ?? 0)} wins!
                </>
              )}
            </p>
            {view.status === 'won' && myTeam !== null && (
              <p className="text-sm text-[var(--muted)]">
                {myTeam === view.winner ? 'Well played!' : 'Better luck next time.'}
              </p>
            )}
            <div className="mt-3 flex justify-center gap-2">
              {isHost ? (
                <>
                  <button className="btn btn-primary" onClick={onRematch} data-testid="rematch">
                    Rematch
                  </button>
                  <button className="btn" onClick={onStart}>
                    Start again now
                  </button>
                </>
              ) : (
                <p className="text-sm text-[var(--muted)]">Waiting for host…</p>
              )}
            </div>
          </div>
        )}
        <Board
          view={view}
          targets={targets}
          actionable={myTurn}
          previewCell={ui.previewCell}
          previewTeam={myTeam}
          freshCells={freshCells}
          freshLines={freshLines}
          onActivate={activate}
        />
      </div>

      {showHand && !desktop && (
        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[var(--panel)] px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
          data-testid="hand-tray"
        >
          <HandTray view={view} dead={dead} myTurn={myTurn} onAction={onAction} compact />
        </div>
      )}

      <aside className="flex w-full flex-col gap-3 lg:w-80">
        {showHand && desktop && (
          <div className="panel p-2" data-testid="hand-tray">
            <HandTray view={view} dead={dead} myTurn={myTurn} onAction={onAction} />
          </div>
        )}
        <PlayersPanel room={room} view={view} />
        <Chat messages={chat} me={me} onSend={onSendChat} className="max-h-72" />
        <section className="panel max-h-56 overflow-y-auto p-3 text-sm" aria-label="Game log">
          <h2 className="mb-1 font-bold">Log</h2>
          <ol className="space-y-0.5 text-[var(--muted)]" data-testid="game-log">
            {log.map((l, i) => (
              <li key={`${log.length - i}`}>{l}</li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}

function HandTray({
  view,
  dead,
  myTurn,
  onAction,
  compact = false,
}: {
  view: PlayerView;
  dead: boolean[];
  myTurn: boolean;
  onAction: (a: ClientAction) => void;
  compact?: boolean;
}) {
  const selected = useStore((s) => s.ui.selectedCard);
  return (
    <div>
      <p className="mb-1 text-center text-xs text-[var(--muted)]">
        {myTurn
          ? selected === null
            ? 'Choose a card'
            : 'Now choose a highlighted cell'
          : 'Your cards (not your turn)'}
      </p>
      <Hand
        hand={view.hand}
        selected={selected}
        dead={dead}
        canSwap={myTurn && !view.deadSwapUsed}
        compact={compact}
        onSelect={(i) => setUi({ selectedCard: selected === i ? null : i, previewCell: null })}
        onSwap={(i) => {
          const card = view.hand[i];
          if (card) onAction({ type: 'discardDead', card });
          setUi({ selectedCard: null, previewCell: null });
        }}
      />
    </div>
  );
}
