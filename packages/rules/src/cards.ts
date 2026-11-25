import type { Card, Rank, Suit } from './types.js';

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: readonly Rank[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'T',
  'J',
  'Q',
  'K',
  'A',
];

/** The 52 distinct card codes. */
export const ALL_CARDS: readonly Card[] = SUITS.flatMap((s) =>
  RANKS.map((r) => `${r}${s}` as Card),
);

/** The 48 non-jack codes that appear on the board. */
export const BOARD_CARDS: readonly Card[] = ALL_CARDS.filter((c) => c[0] !== 'J');

const CARD_SET = new Set<string>(ALL_CARDS);

export function isCard(x: unknown): x is Card {
  return typeof x === 'string' && CARD_SET.has(x);
}

export const isJack = (c: Card): boolean => c[0] === 'J';
/** Wild cards: jack of diamonds and jack of clubs. */
export const isWild = (c: Card): boolean => c === 'JD' || c === 'JC';
/** Cutter cards: jack of hearts and jack of spades. */
export const isCutter = (c: Card): boolean => c === 'JH' || c === 'JS';

/** Two full 52-card decks: 104 cards in canonical order. */
export function fullDeck(): Card[] {
  return [...ALL_CARDS, ...ALL_CARDS];
}

const RANK_NAMES: Record<Rank, string> = {
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  T: '10',
  J: 'Jack',
  Q: 'Queen',
  K: 'King',
  A: 'Ace',
};
const SUIT_NAMES: Record<Suit, string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const SUIT_GLYPHS: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

export const rankOf = (c: Card): Rank => c[0] as Rank;
export const suitOf = (c: Card): Suit => c[1] as Suit;
export const rankLabel = (c: Card): string => (c[0] === 'T' ? '10' : (c[0] as string));
export const suitGlyph = (c: Card): string => SUIT_GLYPHS[suitOf(c)];
export const isRedSuit = (c: Card): boolean => c[1] === 'H' || c[1] === 'D';
/** e.g. "7 of hearts" */
export const cardName = (c: Card): string => `${RANK_NAMES[rankOf(c)]} of ${SUIT_NAMES[suitOf(c)]}`;
