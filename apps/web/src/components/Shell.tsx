import { APP_NAME } from '@lineup/shared-config';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useStore } from '../store';
import { HelpModal } from './HelpModal';

export function Shell({ children, code }: { children: ReactNode; code?: string }) {
  const [help, setHelp] = useState(false);
  const connection = useStore((s) => s.connection);
  const toast = useStore((s) => s.ui.toast);
  const announcement = useStore((s) => s.ui.announcement);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-2 px-3 py-2">
        <Link
          to="/"
          className="flex items-center gap-2 text-lg font-black tracking-tight no-underline"
        >
          <img src="/favicon.svg" alt="" width={24} height={24} />
          {APP_NAME}
        </Link>
        <div className="flex items-center gap-2">
          {code && (
            <span className="font-mono text-sm text-[var(--muted)]">
              <span className="sr-only">Room </span>
              {code}
            </span>
          )}
          <button className="btn min-h-0 py-1" onClick={() => setHelp(true)} aria-haspopup="dialog">
            How to play
          </button>
        </div>
      </header>
      {connection === 'disconnected' && (
        <div
          role="status"
          className="bg-amber-400 px-3 py-1 text-center text-sm font-semibold text-black"
          data-testid="reconnecting"
        >
          Reconnecting…
        </div>
      )}
      <main className="flex-1">{children}</main>
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="announcer">
        {announcement}
      </div>
      {toast && (
        <div
          role="alert"
          className="fixed top-14 left-1/2 z-40 max-w-[90vw] -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg"
          data-testid="toast"
        >
          {toast.text}
        </div>
      )}
      <HelpModal open={help} onClose={() => setHelp(false)} />
    </div>
  );
}
