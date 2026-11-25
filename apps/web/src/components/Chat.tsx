import type { ChatMessage } from '@lineup/protocol';
import { CHAT_MAX_LENGTH } from '@lineup/shared-config';
import { useEffect, useRef, useState, type FormEvent } from 'react';

export function Chat({
  messages,
  me,
  onSend,
  className = '',
}: {
  messages: ChatMessage[];
  me: string | null;
  onSend: (text: string) => Promise<boolean>;
  className?: string;
}) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (await onSend(t)) setText('');
  };

  return (
    <section className={`panel flex min-h-0 flex-col p-3 ${className}`} aria-label="Chat">
      <h2 className="mb-2 text-sm font-bold">Chat</h2>
      <ol
        ref={listRef}
        className="mb-2 min-h-16 flex-1 space-y-1 overflow-y-auto text-sm"
        aria-live="off"
      >
        {messages.length === 0 && <li className="text-[var(--muted)]">No messages yet.</li>}
        {messages.map((m) => (
          <li key={m.id} className="break-words">
            {/* Rendered as text only, never as HTML. */}
            <span className={`font-semibold ${m.playerId === me ? 'text-[var(--accent)]' : ''}`}>
              {m.name}:
            </span>{' '}
            <span>{m.text}</span>
          </li>
        ))}
      </ol>
      <form onSubmit={submit} className="flex gap-2">
        <label className="sr-only" htmlFor="chat-input">
          Message
        </label>
        <input
          id="chat-input"
          className="input min-w-0 flex-1"
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say something…"
          autoComplete="off"
        />
        <button className="btn" type="submit" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
