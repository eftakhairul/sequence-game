import type { RoomState } from '@lineup/protocol';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Lobby, startBlockedReason, type LobbyProps } from './Lobby';

const base: RoomState = {
  code: 'ABC234',
  hostId: 'h',
  config: { playerCount: 4, teamCount: 2, turnSeconds: 60 },
  seats: [
    { playerId: 'h', name: 'Host', connected: true },
    { playerId: 'g', name: 'Guest', connected: false },
    null,
    null,
  ],
  phase: 'lobby',
  you: 'h',
  turnDeadline: null,
  waiting: [{ playerId: 'w', name: 'Watcher', connected: true }],
  serverNow: 0,
};

const setup = (p: Partial<LobbyProps> = {}) => {
  const props: LobbyProps = {
    room: base,
    me: 'h',
    inviteUrl: 'http://x/r/ABC234',
    onSit: vi.fn(),
    onConfig: vi.fn(),
    onKick: vi.fn(),
    onStart: vi.fn(),
    ...p,
  };
  render(<Lobby {...props} />);
  return props;
};

describe('Lobby', () => {
  it('shows the code, invite link and seats grouped by team', () => {
    setup();
    expect(screen.getByTestId('room-code')).toHaveTextContent('ABC234');
    expect(screen.getByRole('button', { name: 'Copy invite link' })).toBeInTheDocument();
    const team0 = screen.getByTestId('team-0');
    const team1 = screen.getByTestId('team-1');
    expect(within(team0).getByText(/Host/)).toBeInTheDocument(); // seat 0 → team 0
    expect(within(team1).getByText(/Guest/)).toBeInTheDocument(); // seat 1 → team 1
    expect(within(team0).getAllByRole('button', { name: /Sit here: seat 3/ })).toHaveLength(1);
  });

  it('host controls: player count, timer, kick, start disabled with reason', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('radio', { name: '6' }));
    expect(p.onConfig).toHaveBeenCalledWith({ playerCount: 6 });
    fireEvent.change(screen.getByLabelText('Turn timer'), { target: { value: '30' } });
    expect(p.onConfig).toHaveBeenCalledWith({ turnSeconds: 30 });
    fireEvent.click(screen.getByRole('button', { name: 'Kick Guest' }));
    expect(p.onKick).toHaveBeenCalledWith('g');
    expect(screen.queryByRole('radio', { name: '3 teams of 2' })).toBeNull(); // only for 6 players
    const start = screen.getByTestId('start-game');
    expect(start).toBeDisabled();
    expect(screen.getByText('Waiting for 2 more players to take a seat')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sit here: seat 3/ }));
    expect(p.onSit).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole('button', { name: 'Stand up' }));
    expect(p.onSit).toHaveBeenCalledWith(null);
  });

  it('team mode appears for 6 players', () => {
    const p = setup({
      room: {
        ...base,
        config: { playerCount: 6, teamCount: 3, turnSeconds: 0 },
        seats: [...base.seats, null, null],
      },
    });
    expect(screen.getAllByTestId(/team-/)).toHaveLength(3);
    fireEvent.click(screen.getByRole('radio', { name: '2 teams of 3' }));
    expect(p.onConfig).toHaveBeenCalledWith({ teamCount: 2 });
  });

  it('enables start when all seats are filled', () => {
    const full = {
      ...base,
      seats: base.seats.map((s, i) => s ?? { playerId: `p${i}`, name: `P${i}`, connected: true }),
    };
    const p = setup({ room: full });
    fireEvent.click(screen.getByTestId('start-game'));
    expect(p.onStart).toHaveBeenCalled();
    expect(startBlockedReason(full, 'h')).toBeNull();
    expect(startBlockedReason(full, 'g')).toMatch(/host/);
  });

  it('non-hosts see no kick buttons and a waiting message', () => {
    setup({ me: 'g', room: { ...base, you: 'g' } });
    expect(screen.queryByRole('button', { name: /Kick/ })).toBeNull();
    expect(screen.queryByTestId('start-game')).toBeNull();
    expect(screen.getByText(/Waiting for the host/)).toBeInTheDocument();
  });
});
