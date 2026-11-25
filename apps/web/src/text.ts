import type { ErrorCode, RoomState } from '@lineup/protocol';
import { cardName, type GameEvent, type PlayerView, type TeamId } from '@lineup/rules';
import { TEAM_STYLE } from '@lineup/shared-config';

export const teamName = (t: TeamId | number) => `${TEAM_STYLE[t as TeamId].name} team`;
export const teamLabel = (t: TeamId | number) =>
  `${TEAM_STYLE[t as TeamId].name} ${TEAM_STYLE[t as TeamId].shape}`;

export function seatName(room: RoomState | null, seat: number): string {
  return room?.seats[seat]?.name ?? `Seat ${seat + 1}`;
}

const ERROR_TEXT: Partial<Record<ErrorCode, string>> = {
  BAD_REQUEST: 'That request was not valid.',
  RATE_LIMITED: 'Slow down a little.',
  ROOM_NOT_FOUND: 'That room does not exist (it may have expired).',
  ROOM_FULL: 'That room is full.',
  NOT_HOST: 'Only the host can do that.',
  NOT_IN_ROOM: 'You are not in this room.',
  KICKED: 'The host removed you from this room.',
  WRONG_PHASE: 'You cannot do that right now.',
  SEATS_NOT_FILLED: 'Every seat must be filled before starting.',
  SEAT_TAKEN: 'That seat was just taken.',
  NOT_YOUR_TURN: 'It is not your turn.',
  GAME_OVER: 'The game is over.',
  CARD_NOT_IN_HAND: 'That card is not in your hand.',
  CELL_NOT_EMPTY: 'That cell is already taken.',
  CELL_MISMATCH: 'That card does not match the cell.',
  CORNER: 'Corners are free cells; no chips there.',
  NOT_WILD: 'That jack is a cutter, not a wild.',
  NOT_CUTTER: 'That card is not a cutter.',
  CUT_OWN_OR_EMPTY: 'Cutters remove an opponent chip only.',
  CUT_LOCKED: 'Chips in a completed line are locked.',
  NOT_DEAD: 'That card is still playable.',
  DEAD_SWAP_USED: 'You already swapped a dead card this turn.',
  INTERNAL: 'Something went wrong on the server.',
};

export function errorText(code: string, message?: string): string {
  return message ?? ERROR_TEXT[code as ErrorCode] ?? `Error: ${code}`;
}

/** Human-readable descriptions of game events (log + screen-reader announcements). */
export function describeEvents(
  events: GameEvent[],
  room: RoomState | null,
  view: PlayerView,
): string[] {
  const out: string[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'chipPlaced':
        out.push(
          `${seatName(room, e.seat)} played ${cardName(e.card)}${e.card[0] === 'J' ? ' (wild)' : ''}.`,
        );
        break;
      case 'chipCut':
        out.push(`${seatName(room, e.seat)} used a cutter on a ${teamName(e.removedTeam)} chip.`);
        break;
      case 'deadSwapped':
        out.push(`${seatName(room, e.seat)} swapped a dead ${cardName(e.card)}.`);
        break;
      case 'lineMade':
        out.push(`${teamName(e.line.team)} completed a line!`);
        break;
      case 'turnSkipped':
        out.push(
          `${seatName(room, e.seat)}'s turn was skipped (${
            e.reason === 'timeout' ? 'time ran out' : e.reason === 'afk' ? 'away' : 'no moves'
          }).`,
        );
        break;
      case 'deckReshuffled':
        out.push('The discard pile was shuffled into a new deck.');
        break;
      case 'gameOver':
        out.push(
          e.status === 'draw' ? 'The game ended in a draw.' : `${teamName(e.winner ?? 0)} wins!`,
        );
        break;
    }
  }
  if (view.status === 'playing' && events.length > 0) {
    out.push(
      view.you === view.currentSeat ? 'Your turn.' : `${seatName(room, view.currentSeat)}'s turn.`,
    );
  }
  return out;
}
