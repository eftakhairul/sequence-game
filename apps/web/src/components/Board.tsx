import {
  BOARD,
  cardName,
  isCorner,
  isRedSuit,
  lockedCells,
  rankLabel,
  suitGlyph,
  type Line,
  type PlayerView,
} from '@lineup/rules';
import { AnimatePresence, m } from 'motion/react';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { teamLabel } from '../text';
import { ChipShape } from './Chip';

export interface BoardProps {
  view: Pick<PlayerView, 'chips' | 'lines'>;
  /** legal target cells for the selected card, or null when nothing is selected */
  targets: number[] | null;
  /** whether highlighted cells can be activated (your turn) */
  actionable: boolean;
  previewCell?: number | null;
  previewTeam?: number | null;
  /** cells whose chips were placed by the latest update (drop-in animation) */
  freshCells?: ReadonlySet<number>;
  /** keys of lines made by the latest update (stroke animation) */
  freshLines?: ReadonlySet<string>;
  onActivate?: (cell: number, viaTouch: boolean) => void;
  label?: string;
}

export const lineKey = (l: Line) => `${l.team}:${l.dir}:${l.cells.join(',')}`;

export function Board({
  view,
  targets,
  actionable,
  previewCell = null,
  previewTeam = null,
  freshCells,
  freshLines,
  onActivate,
  label = 'Game board',
}: BoardProps) {
  const locked = useMemo(() => lockedCells(view.lines), [view.lines]);
  const targetSet = useMemo(() => new Set(targets ?? []), [targets]);
  const [focus, setFocus] = useState(0);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pointerType = useRef<string>('mouse');

  const move = (next: number) => {
    const n = Math.max(0, Math.min(99, next));
    setFocus(n);
    cellRefs.current[n]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const r = Math.floor(focus / 10);
    const c = focus % 10;
    switch (e.key) {
      case 'ArrowRight':
        if (c < 9) move(focus + 1);
        break;
      case 'ArrowLeft':
        if (c > 0) move(focus - 1);
        break;
      case 'ArrowDown':
        if (r < 9) move(focus + 10);
        break;
      case 'ArrowUp':
        if (r > 0) move(focus - 10);
        break;
      case 'Home':
        move(r * 10);
        break;
      case 'End':
        move(r * 10 + 9);
        break;
      case 'Enter':
      case ' ':
        if (actionable && targetSet.has(focus)) onActivate?.(focus, false);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const rows = [];
  for (let r = 0; r < 10; r++) {
    const cells = [];
    for (let c = 0; c < 10; c++) {
      const i = r * 10 + c;
      const card = BOARD[i] ?? null;
      const chip = view.chips[i] ?? null;
      const isTarget = targets !== null && targetSet.has(i);
      const dim = targets !== null && !isTarget;
      const isLocked = chip !== null && locked.has(i);
      const showPreview = previewCell === i && previewTeam !== null;
      const desc = [
        card ? cardName(card) : 'Free corner',
        chip !== null ? `${teamLabel(chip).toLowerCase()} chip` : isCorner(i) ? null : 'empty',
        isLocked ? 'locked' : null,
        isTarget ? (actionable ? 'playable' : 'possible target') : null,
      ]
        .filter(Boolean)
        .join(', ');
      cells.push(
        <div
          key={i}
          ref={(el) => {
            cellRefs.current[i] = el;
          }}
          role="gridcell"
          aria-selected={previewCell === i}
          aria-disabled={!(actionable && isTarget)}
          tabIndex={focus === i ? 0 : -1}
          data-cell={i}
          data-target={isTarget && actionable ? 'true' : 'false'}
          data-possible={isTarget ? 'true' : 'false'}
          data-dim={dim ? 'true' : 'false'}
          data-chip={chip !== null ? 'true' : 'false'}
          data-team={chip ?? ''}
          className="cell"
          onFocus={() => setFocus(i)}
          onPointerDown={(e) => {
            pointerType.current = e.pointerType;
          }}
          onClick={() => {
            setFocus(i);
            if (actionable && isTarget) onActivate?.(i, pointerType.current === 'touch');
          }}
        >
          <span className="sr-only">{desc}</span>
          {card ? (
            <span
              className={`label ${isRedSuit(card) ? 'suit-red' : 'suit-black'}`}
              aria-hidden="true"
            >
              <span>{rankLabel(card)}</span>
              <span>{suitGlyph(card)}</span>
            </span>
          ) : (
            <span aria-hidden="true" className="text-[1.3em] text-[var(--muted)]">
              ★
            </span>
          )}
          <AnimatePresence>
            {chip !== null && (
              <m.span
                key={`chip-${chip}`}
                className="absolute inset-0 flex items-center justify-center"
                initial={freshCells?.has(i) ? { scale: 1.8, opacity: 0, y: -12 } : false}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.4 }}
                transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              >
                <ChipShape team={chip} locked={isLocked} />
              </m.span>
            )}
          </AnimatePresence>
          {showPreview && chip === null && (
            <span
              className="absolute inset-0 flex items-center justify-center opacity-60"
              data-preview="true"
            >
              <ChipShape team={previewTeam as 0 | 1 | 2} />
            </span>
          )}
        </div>,
      );
    }
    rows.push(
      <div role="row" key={r} className="contents">
        {cells}
      </div>,
    );
  }

  return (
    <div
      className="board"
      role="grid"
      aria-label={label}
      aria-rowcount={10}
      aria-colcount={10}
      onKeyDown={onKeyDown}
    >
      {rows}
      <svg
        className="pointer-events-none absolute inset-[4px]"
        style={{ width: 'calc(100% - 8px)', height: 'calc(100% - 8px)' }}
        viewBox="0 0 10 10"
        aria-hidden="true"
      >
        {view.lines.map((l) => {
          const [a, , , , b] = l.cells;
          const k = lineKey(l);
          const fresh = freshLines?.has(k) ?? false;
          return (
            <m.line
              key={k}
              data-line={k}
              x1={(a % 10) + 0.5}
              y1={Math.floor(a / 10) + 0.5}
              x2={(b % 10) + 0.5}
              y2={Math.floor(b / 10) + 0.5}
              className={`chip-${l.team}`}
              stroke="currentColor"
              strokeWidth={0.16}
              strokeLinecap="round"
              strokeOpacity={0.85}
              initial={fresh ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          );
        })}
      </svg>
    </div>
  );
}
