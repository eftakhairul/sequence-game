import { STORAGE_KEYS } from '@lineup/shared-config';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { Chat } from '../components/Chat';
import { GameView } from '../components/GameView';
import { Lobby } from '../components/Lobby';
import { Shell } from '../components/Shell';
import { act, getSocket, request, storage } from '../socket';
import { resetRoom, setUi, useStore } from '../store';
import { errorText } from '../text';
import { NameField, validName } from './Home';

export function Room() {
  const code = (useParams().code ?? '').toUpperCase();
  const [name, setName] = useState(() => storage.get(STORAGE_KEYS.name) ?? '');
  const [hasName, setHasName] = useState(() => validName(storage.get(STORAGE_KEYS.name) ?? ''));
  const [joinError, setJoinError] = useState<string | null>(null);
  const room = useStore((s) => s.room);
  const view = useStore((s) => s.game.view);
  const chat = useStore((s) => s.chat);
  const connection = useStore((s) => s.connection);
  const joinedFor = useRef<string | null>(null);
  const removed = useStore((s) => s.ui.removedFrom === code);

  // Join (and re-join after every reconnect, which also covers a server restart).
  useEffect(() => {
    if (!hasName) return;
    const socket = getSocket();
    const join = async () => {
      // Never rejoin a room the host removed us from (e.g. after a reconnect).
      if (useStore.getState().ui.removedFrom === code) return;
      const res = await request('room:join', {
        code,
        name: storage.get(STORAGE_KEYS.name) ?? name,
      });
      if (!res.ok && res.code === 'KICKED') setUi({ removedFrom: code });
      else if (!res.ok)
        setJoinError(
          res.code === 'ROOM_NOT_FOUND' ? 'ROOM_NOT_FOUND' : errorText(res.code, res.message),
        );
      else setJoinError(null);
    };
    if (joinedFor.current !== code) {
      if (useStore.getState().room?.code !== code) resetRoom();
      joinedFor.current = code;
      if (socket.connected) void join();
    }
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
    };
  }, [code, hasName, name]);

  const submitName = (e: FormEvent) => {
    e.preventDefault();
    if (!validName(name)) return;
    storage.set(STORAGE_KEYS.name, name.trim());
    setHasName(true);
  };

  const sendChat = useCallback(async (text: string) => (await act('chat:send', { text })).ok, []);

  if (!hasName) {
    return (
      <Shell code={code}>
        <form className="panel mx-auto mt-8 max-w-md space-y-4 p-4" onSubmit={submitName}>
          <h1 className="text-xl font-bold">Join room {code}</h1>
          <NameField value={name} onChange={setName} autoFocus />
          <button
            className="btn btn-primary w-full"
            type="submit"
            disabled={!validName(name)}
            data-testid="join-with-name"
          >
            Join
          </button>
        </form>
      </Shell>
    );
  }

  if (removed) {
    return (
      <Shell code={code}>
        <div
          className="panel mx-auto mt-8 max-w-md space-y-3 p-5 text-center"
          role="alert"
          data-testid="removed"
        >
          <h1 className="text-xl font-bold">You were removed</h1>
          <p className="text-[var(--muted)]">The host removed you from room {code}.</p>
          <Link className="btn btn-primary" to="/">
            Back to home
          </Link>
        </div>
      </Shell>
    );
  }

  if (joinError) {
    return (
      <Shell code={code}>
        <div className="panel mx-auto mt-8 max-w-md space-y-3 p-5 text-center" role="alert">
          <h1 className="text-xl font-bold">
            {joinError === 'ROOM_NOT_FOUND' ? 'Room not found' : 'Could not join'}
          </h1>
          <p className="text-[var(--muted)]">
            {joinError === 'ROOM_NOT_FOUND'
              ? `There is no room with the code ${code}. It may have expired, or the code may be mistyped.`
              : joinError}
          </p>
          <Link className="btn btn-primary" to="/">
            Back to home
          </Link>
        </div>
      </Shell>
    );
  }

  if (!room || room.code !== code) {
    return (
      <Shell code={code}>
        <p className="p-6 text-center text-[var(--muted)]" role="status">
          {connection === 'connected' ? 'Joining room…' : 'Connecting…'}
        </p>
      </Shell>
    );
  }

  const seated = room.seats.some((s) => s?.playerId === room.you);
  const inviteUrl = `${window.location.origin}/r/${room.code}`;

  return (
    <Shell code={room.code}>
      {room.phase === 'lobby' ? (
        <>
          <Lobby
            room={room}
            me={room.you}
            inviteUrl={inviteUrl}
            onSit={(seat) => void act('room:seat', { seat })}
            onConfig={(patch) => void act('room:config', patch)}
            onKick={(playerId) => void act('room:kick', { playerId })}
            onStart={() => void act('room:start')}
          />
          <div className="mx-auto w-full max-w-5xl px-3 pb-6">
            <Chat messages={chat} me={room.you} onSend={sendChat} className="max-h-80" />
          </div>
        </>
      ) : seated && !view ? (
        <p className="p-6 text-center text-[var(--muted)]" role="status">
          Loading game…
        </p>
      ) : seated && view ? (
        <GameView
          room={room}
          view={view}
          onAction={(a) => void act('game:action', a)}
          onSendChat={sendChat}
          onRematch={() => void act('room:rematch')}
          onStart={() => void act('room:start')}
        />
      ) : (
        <div className="mx-auto max-w-xl space-y-4 p-4">
          <div className="panel p-5 text-center" role="status" data-testid="game-in-progress">
            <h1 className="text-xl font-bold">
              {room.phase === 'playing' ? 'Game in progress' : 'Game finished'}
            </h1>
            <p className="text-[var(--muted)]">You can take a seat when the next round starts.</p>
          </div>
          <Chat messages={chat} me={room.you} onSend={sendChat} className="max-h-80" />
        </div>
      )}
    </Shell>
  );
}
