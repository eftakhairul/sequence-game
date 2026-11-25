import {
  APP_NAME,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  STORAGE_KEYS,
} from '@lineup/shared-config';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Shell } from '../components/Shell';
import { act, storage } from '../socket';

export const validName = (n: string) =>
  n.trim().length >= 1 && n.trim().length <= NAME_MAX_LENGTH && NAME_PATTERN.test(n.trim());
const codeRe = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export function NameField({
  value,
  onChange,
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const invalid = value.trim() !== '' && !validName(value);
  return (
    <div>
      <label htmlFor="name" className="mb-1 block text-sm font-semibold">
        Your name
      </label>
      <input
        id="name"
        className="input w-full"
        value={value}
        maxLength={NAME_MAX_LENGTH}
        autoFocus={autoFocus}
        autoComplete="nickname"
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        aria-describedby="name-help"
      />
      <p
        id="name-help"
        className={`mt-1 text-xs ${invalid ? 'text-[var(--suit-red)]' : 'text-[var(--muted)]'}`}
      >
        1–{NAME_MAX_LENGTH} characters: letters, numbers, spaces and - _ . '
      </p>
    </div>
  );
}

export function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => storage.get(STORAGE_KEYS.name) ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const nameOk = validName(name);
  const codeOk = codeRe.test(code.trim().toUpperCase());

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!nameOk) return;
    setBusy(true);
    storage.set(STORAGE_KEYS.name, name.trim());
    const res = await act<{ code: string }>('room:create', { name: name.trim() });
    setBusy(false);
    if (res.ok) void navigate(`/r/${res.code}`);
  };
  const join = (e: FormEvent) => {
    e.preventDefault();
    if (!nameOk || !codeOk) return;
    storage.set(STORAGE_KEYS.name, name.trim());
    void navigate(`/r/${code.trim().toUpperCase()}`);
  };

  return (
    <Shell>
      <div className="mx-auto max-w-md space-y-5 p-4">
        <div className="pt-4 text-center">
          <h1 className="text-4xl font-black">{APP_NAME}</h1>
          <p className="mt-1 text-[var(--muted)]">
            A card-grid five-in-a-row team game for 2, 4 or 6 players.
          </p>
        </div>
        <form className="panel space-y-4 p-4" onSubmit={create}>
          <NameField value={name} onChange={setName} autoFocus />
          <button
            className="btn btn-primary w-full text-base"
            type="submit"
            disabled={!nameOk || busy}
            data-testid="create-room"
          >
            Create room
          </button>
        </form>
        <form className="panel space-y-2 p-4" onSubmit={join}>
          <label htmlFor="code" className="block text-sm font-semibold">
            Join with a code
          </label>
          <div className="flex gap-2">
            <input
              id="code"
              className="input min-w-0 flex-1 font-mono uppercase tracking-widest"
              value={code}
              maxLength={ROOM_CODE_LENGTH}
              placeholder="ABC234"
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button
              className="btn"
              type="submit"
              disabled={!nameOk || !codeOk}
              data-testid="join-room"
            >
              Join
            </button>
          </div>
          {!nameOk && <p className="text-xs text-[var(--muted)]">Enter your name above first.</p>}
        </form>
      </div>
    </Shell>
  );
}
