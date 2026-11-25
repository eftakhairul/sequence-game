import { APP_NAME } from '@lineup/shared-config';
import { useEffect, useRef } from 'react';

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="panel max-h-[90dvh] w-full max-w-lg overflow-y-auto p-5"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="help-title" className="text-xl font-bold">
            How to play {APP_NAME}
          </h2>
          <button className="btn" onClick={onClose} aria-label="Close help">
            ✕
          </button>
        </div>
        <div className="space-y-3 text-sm leading-relaxed">
          <p>
            Teams race to build <strong>lines</strong>: five of their chips in a straight row —
            across, down or diagonally. The four starred corners are free and count for every team.
          </p>
          <h3 className="font-bold">Your turn</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Pick a card from your hand, then pick a highlighted cell that shows the same card to
              put your chip there. Each card appears twice on the board.
            </li>
            <li>
              <strong>Wild</strong> cards (jack of diamonds or clubs) put your chip on any empty
              cell.
            </li>
            <li>
              <strong>Cutter</strong> cards (jack of hearts or spades) remove one opponent chip
              instead. Chips that are already part of a finished line are locked and cannot be cut.
            </li>
            <li>
              After playing you draw a new card automatically, and the turn moves on clockwise.
            </li>
          </ul>
          <h3 className="font-bold">Dead cards</h3>
          <p>
            If both cells for a card are already covered, the card is dead. Once per turn, before
            you play, you may swap one dead card for a fresh one with the <em>Swap</em> button.
          </p>
          <h3 className="font-bold">Winning</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Two teams: the first team to complete two lines wins.</li>
            <li>Three teams: one line is enough.</li>
            <li>Two lines of the same team in the same direction may share at most one cell.</li>
          </ul>
          <h3 className="font-bold">Teams and seats</h3>
          <p>
            2 players play one-on-one, 4 players form two teams of two, and 6 players form either
            two teams of three or three teams of two. Team members sit alternately around the table.
            You only see your own cards.
          </p>
          <h3 className="font-bold">Timer</h3>
          <p>
            If the turn timer runs out, the turn is skipped. After three missed turns in a row a
            player is marked away and skipped until they act again.
          </p>
          <h3 className="font-bold">On a phone</h3>
          <p>Tap a cell once to preview your chip, then tap it again to confirm.</p>
        </div>
      </div>
    </div>
  );
}
