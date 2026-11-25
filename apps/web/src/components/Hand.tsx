import {
  cardName,
  isCutter,
  isRedSuit,
  isWild,
  rankLabel,
  suitGlyph,
  type Card,
} from '@lineup/rules';

export interface HandProps {
  hand: Card[];
  selected: number | null;
  dead: boolean[];
  /** show Swap buttons (your turn and the swap is unused) */
  canSwap: boolean;
  onSelect: (index: number) => void;
  onSwap: (index: number) => void;
  /** single scrollable row with smaller cards (phone tray) */
  compact?: boolean;
}

export function Hand({
  hand,
  selected,
  dead,
  canSwap,
  onSelect,
  onSwap,
  compact = false,
}: HandProps) {
  if (hand.length === 0) return <p className="text-sm text-[var(--muted)]">No cards in hand.</p>;
  return (
    <ul
      className={
        compact
          ? 'hand-compact flex gap-1.5 overflow-x-auto px-1 pt-2 pb-3 [&>li:first-child]:ml-auto [&>li:last-child]:mr-auto'
          : 'flex flex-wrap justify-center gap-2 px-1 py-1'
      }
      aria-label="Your hand"
    >
      {hand.map((card, i) => {
        const wild = isWild(card);
        const cutter = isCutter(card);
        const isDead = dead[i] ?? false;
        const name =
          cardName(card) +
          (wild ? ', wild' : cutter ? ', cutter' : '') +
          (isDead ? ', dead card' : '');
        return (
          <li key={`${card}-${i}`} className="flex flex-col items-center gap-1">
            <button
              type="button"
              className="hand-card"
              aria-pressed={selected === i}
              data-card={card}
              data-dead={isDead ? 'true' : 'false'}
              onClick={() => onSelect(i)}
            >
              <span className="sr-only">{name}</span>
              <span aria-hidden="true" className={isRedSuit(card) ? 'suit-red' : 'suit-black'}>
                {rankLabel(card)}
              </span>
              <span
                aria-hidden="true"
                className={`text-[1.3rem] ${isRedSuit(card) ? 'suit-red' : 'suit-black'}`}
              >
                {suitGlyph(card)}
              </span>
              {(wild || cutter) && (
                <span className="badge absolute -bottom-2" aria-hidden="true">
                  {wild ? 'Wild' : 'Cutter'}
                </span>
              )}
            </button>
            {isDead && canSwap && (
              <button
                type="button"
                className="btn mt-1 min-h-0 px-2 py-0.5 text-xs"
                onClick={() => onSwap(i)}
                aria-label={`Swap dead ${cardName(card)}`}
              >
                Swap
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
