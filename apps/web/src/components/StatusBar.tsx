import type { RoomState } from '@lineup/protocol';
import {
  rankLabel,
  rulesFor,
  suitGlyph,
  isRedSuit,
  type PlayerView,
  type TeamId,
} from '@lineup/rules';
import { seatName, teamLabel } from '../text';
import { TeamGlyph } from './Chip';
import { useRemainingSeconds } from './Countdown';

export function StatusBar({
  room,
  view,
  turnDeadline,
  clockOffset,
}: {
  room: RoomState;
  view: PlayerView;
  turnDeadline: number | null;
  clockOffset: number;
}) {
  const remaining = useRemainingSeconds(turnDeadline, clockOffset);
  const myTurn = view.you !== null && view.you === view.currentSeat;
  const { linesToWin } = rulesFor(view.config);
  const top = view.discard[0];
  const teams = Array.from({ length: view.config.teamCount }, (_, t) => t as TeamId);
  return (
    <div
      className="panel flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm"
      data-testid="status-bar"
    >
      <div className="font-semibold" data-testid="turn-indicator">
        {view.status !== 'playing'
          ? 'Game over'
          : myTurn
            ? 'Your turn'
            : `${seatName(room, view.currentSeat)}'s turn`}
        {remaining !== null && view.status === 'playing' && (
          <span
            className={`ml-2 tabular-nums ${remaining <= 10 ? 'text-[var(--suit-red)]' : 'text-[var(--muted)]'}`}
            data-testid="countdown"
          >
            <span aria-hidden="true">⏱ </span>
            {remaining}s<span className="sr-only"> left</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span title="Cards left in the deck" data-testid="deck-count">
          Deck {view.deckCount}
        </span>
        <span title="Top of the discard pile" data-testid="top-discard">
          Discard{' '}
          {top ? (
            <strong className={isRedSuit(top) ? 'suit-red' : 'suit-black'}>
              {rankLabel(top)}
              {suitGlyph(top)}
            </strong>
          ) : (
            '—'
          )}
        </span>
        <span
          className="flex items-center gap-2"
          data-testid="scores"
          role="group"
          aria-label="Lines per team"
        >
          {teams.map((t) => (
            <span key={t} className="flex items-center gap-1" title={`${teamLabel(t)} lines`}>
              <TeamGlyph team={t} />
              <span className="tabular-nums">
                {view.lines.filter((l) => l.team === t).length}/{linesToWin}
              </span>
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
