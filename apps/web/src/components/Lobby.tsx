import type { RoomState } from '@lineup/protocol';
import { rulesFor, teamOf, type GameConfig, type TeamId } from '@lineup/rules';
import { TURN_SECONDS_OPTIONS } from '@lineup/shared-config';
import { useState } from 'react';
import { teamLabel, teamName } from '../text';
import { TeamGlyph } from './Chip';

export interface LobbyProps {
  room: RoomState;
  me: string;
  inviteUrl: string;
  onSit: (seat: number | null) => void;
  onConfig: (patch: Partial<GameConfig>) => void;
  onKick: (playerId: string) => void;
  onStart: () => void;
}

export function startBlockedReason(room: RoomState, me: string): string | null {
  if (room.hostId !== me) return 'Only the host can start the game';
  const empty = room.seats.filter((s) => s === null).length;
  if (empty > 0) return `Waiting for ${empty} more player${empty === 1 ? '' : 's'} to take a seat`;
  return null;
}

export function Lobby({ room, me, inviteUrl, onSit, onConfig, onKick, onStart }: LobbyProps) {
  const isHost = room.hostId === me;
  const [copied, setCopied] = useState(false);
  const cfg = room.config;
  const mySeat = room.seats.findIndex((s) => s?.playerId === me);
  const blocked = startBlockedReason(room, me);
  const teams = Array.from({ length: cfg.teamCount }, (_, t) => t as TeamId);
  const { handSize, linesToWin } = rulesFor(cfg);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this invite link:', inviteUrl);
    }
  };
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 p-3 md:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <section className="panel p-4" aria-label="Invite">
          <p className="text-sm text-[var(--muted)]">Room code</p>
          <p className="font-mono text-4xl font-black tracking-[0.2em]" data-testid="room-code">
            {room.code}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary text-base" onClick={copy} data-testid="copy-invite">
              {copied ? 'Copied!' : 'Copy invite link'}
            </button>
            {canShare && (
              <button
                className="btn"
                onClick={() =>
                  void navigator
                    .share({ title: 'Join my game', url: inviteUrl })
                    .catch(() => undefined)
                }
              >
                Share…
              </button>
            )}
          </div>
          <p className="mt-2 break-all text-xs text-[var(--muted)]" data-testid="invite-url">
            {inviteUrl}
          </p>
        </section>

        <section className="panel p-4" aria-label="Seats">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Seats</h2>
            {mySeat >= 0 && (
              <button className="btn text-sm" onClick={() => onSit(null)}>
                Stand up
              </button>
            )}
          </div>
          <div
            className={`grid gap-3 ${cfg.teamCount === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
          >
            {teams.map((t) => (
              <div
                key={t}
                className="rounded-lg border border-[var(--border)] p-2"
                data-testid={`team-${t}`}
              >
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <TeamGlyph team={t} /> {teamName(t)}
                  <span className="sr-only">({teamLabel(t)})</span>
                </h3>
                <ul className="space-y-2">
                  {room.seats.map((s, seat) =>
                    teamOf(seat, cfg) !== t ? null : (
                      <li key={seat} className="flex items-center gap-2" data-seat={seat}>
                        <span className="w-14 text-xs text-[var(--muted)]">Seat {seat + 1}</span>
                        {s ? (
                          <>
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${s.connected ? 'bg-green-600' : 'bg-gray-400'}`}
                              role="img"
                              aria-label={s.connected ? 'connected' : 'disconnected'}
                            />
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {s.name}
                              {s.playerId === me && (
                                <span className="text-[var(--muted)]"> (you)</span>
                              )}
                              {s.playerId === room.hostId && (
                                <span className="badge ml-1" title="Host">
                                  host
                                </span>
                              )}
                            </span>
                            {isHost && s.playerId !== me && (
                              <button
                                className="btn min-h-0 px-2 py-1 text-xs"
                                onClick={() => onKick(s.playerId)}
                                aria-label={`Kick ${s.name}`}
                              >
                                Kick
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            className="btn min-h-0 flex-1 border-dashed py-1 text-sm"
                            onClick={() => onSit(seat)}
                            aria-label={`Sit here: seat ${seat + 1}, ${teamName(t)}`}
                          >
                            Sit here
                          </button>
                        )}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
          </div>
          {room.waiting.length > 0 && (
            <div className="mt-3 text-sm">
              <h3 className="font-bold">Not seated</h3>
              <ul className="mt-1 flex flex-wrap gap-2">
                {room.waiting.map((w) => (
                  <li key={w.playerId} className="badge flex items-center gap-1 normal-case">
                    {w.name}
                    {w.playerId === me && ' (you)'}
                    {isHost && w.playerId !== me && (
                      <button
                        className="ml-1 underline"
                        onClick={() => onKick(w.playerId)}
                        aria-label={`Kick ${w.name}`}
                      >
                        kick
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <section className="panel h-fit space-y-4 p-4" aria-label="Game settings">
        <h2 className="text-lg font-bold">Settings</h2>
        <fieldset disabled={!isHost} className="space-y-3">
          <legend className="sr-only">Game settings (host only)</legend>
          <div>
            <p className="mb-1 text-sm font-semibold" id="pc-label">
              Players
            </p>
            <div className="flex gap-2" role="radiogroup" aria-labelledby="pc-label">
              {([2, 4, 6] as const).map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={cfg.playerCount === n}
                  className={`btn flex-1 ${cfg.playerCount === n ? 'btn-primary' : ''}`}
                  onClick={() => onConfig({ playerCount: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {cfg.playerCount === 6 && (
            <div>
              <p className="mb-1 text-sm font-semibold" id="tm-label">
                Teams
              </p>
              <div className="flex gap-2" role="radiogroup" aria-labelledby="tm-label">
                {([2, 3] as const).map((t) => (
                  <button
                    key={t}
                    role="radio"
                    aria-checked={cfg.teamCount === t}
                    className={`btn flex-1 ${cfg.teamCount === t ? 'btn-primary' : ''}`}
                    onClick={() => onConfig({ teamCount: t })}
                  >
                    {t === 2 ? '2 teams of 3' : '3 teams of 2'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-semibold" htmlFor="timer">
              Turn timer
            </label>
            <select
              id="timer"
              className="input w-full"
              value={
                TURN_SECONDS_OPTIONS.includes(cfg.turnSeconds as never) ? cfg.turnSeconds : 'custom'
              }
              onChange={(e) => onConfig({ turnSeconds: Number(e.target.value) })}
            >
              {TURN_SECONDS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === 0 ? 'Off' : `${s} seconds`}
                </option>
              ))}
              {!TURN_SECONDS_OPTIONS.includes(cfg.turnSeconds as never) && (
                <option value="custom" disabled>
                  {cfg.turnSeconds} seconds
                </option>
              )}
            </select>
          </div>
        </fieldset>
        <p className="text-xs text-[var(--muted)]">
          {handSize} cards each · {linesToWin} line{linesToWin > 1 ? 's' : ''} to win
        </p>
        {isHost ? (
          <span title={blocked ?? 'Start the game'} className="block">
            <button
              className="btn btn-primary w-full text-base"
              disabled={blocked !== null}
              onClick={onStart}
              aria-describedby={blocked ? 'start-reason' : undefined}
              data-testid="start-game"
            >
              Start game
            </button>
            {blocked && (
              <span id="start-reason" className="mt-1 block text-xs text-[var(--muted)]">
                {blocked}
              </span>
            )}
          </span>
        ) : (
          <p className="text-sm text-[var(--muted)]">Waiting for the host to start…</p>
        )}
      </section>
    </div>
  );
}
