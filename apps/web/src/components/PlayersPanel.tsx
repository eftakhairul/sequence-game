import type { RoomState } from '@lineup/protocol';
import { teamOf, type PlayerView } from '@lineup/rules';
import { teamLabel } from '../text';
import { TeamGlyph } from './Chip';

export function PlayersPanel({ room, view }: { room: RoomState; view: PlayerView }) {
  return (
    <section className="panel p-3" aria-label="Players">
      <h2 className="mb-2 text-sm font-bold">Players</h2>
      <ul className="space-y-1">
        {room.seats.map((s, seat) => {
          const team = teamOf(seat, view.config);
          const current = view.status === 'playing' && view.currentSeat === seat;
          return (
            <li
              key={seat}
              data-seat={seat}
              data-team={team}
              aria-current={current ? 'true' : undefined}
              className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm ${
                current ? 'bg-[var(--panel-2)] ring-2 ring-[var(--target)]' : ''
              }`}
            >
              <TeamGlyph team={team} />
              <span className="sr-only">{teamLabel(team)}</span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {s?.name ?? 'Empty'}
                {view.you === seat && <span className="text-[var(--muted)]"> (you)</span>}
              </span>
              {view.afk[seat] && <span className="badge">away</span>}
              <span className="tabular-nums text-[var(--muted)]" data-testid="hand-count">
                <span aria-hidden="true">🂠 </span>
                {view.handCounts[seat] ?? 0}
                <span className="sr-only"> cards</span>
              </span>
              <span
                className={`h-2.5 w-2.5 rounded-full ${s?.connected ? 'bg-green-600' : 'bg-gray-400'}`}
                role="img"
                aria-label={s?.connected ? 'connected' : 'disconnected'}
                title={s?.connected ? 'connected' : 'disconnected'}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
