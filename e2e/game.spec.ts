import { expect, test } from '@playwright/test';
import {
  BOARD,
  apply,
  cellsFor,
  createGame,
  legalActions,
  viewFor,
  type Card,
  type GameState,
} from '../packages/rules/dist/index.js';
import {
  cell,
  createRoom,
  emit,
  expectNoSeriousA11yViolations,
  handCard,
  handCards,
  joinByLink,
  newPlayer,
  setState,
  twoPlayerGame,
} from './helpers.js';

const CFG2 = { playerCount: 2, teamCount: 2, turnSeconds: 0 } as const;
const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

test('1. two-player game: create, join via link, play turns, hidden hands', async ({
  browser,
  browserName,
}) => {
  const host = await newPlayer(
    browser,
    browserName === 'chromium' ? { permissions: ['clipboard-read', 'clipboard-write'] } : {},
  );
  const url = await createRoom(host, 'Alice', 2);
  await host.getByTestId('copy-invite').click();
  await expect(host.getByTestId('copy-invite')).toHaveText(/Copied!|Copy invite link/);
  const copied =
    browserName === 'chromium' ? await host.evaluate(() => navigator.clipboard.readText()) : url;
  expect(copied).toBe(url);
  await expectNoSeriousA11yViolations(host);

  const guest = await newPlayer(browser);
  await joinByLink(guest, copied, 'Bob');
  await expect(host.getByTestId('start-game')).toBeEnabled();

  const seed: [number, number, number, number] = [10, 20, 30, 40];
  expect(await emit(host, 'room:testStart', { seed })).toMatchObject({ ok: true });
  let expected = createGame(CFG2, seed);

  await expect(host.getByRole('grid')).toBeVisible();
  expect(await handCards(host)).toEqual(expected.hands[0]);
  expect(await handCards(guest)).toEqual(expected.hands[1]);
  await expectNoSeriousA11yViolations(host);

  for (let i = 0; i < 4; i++) {
    const seat = expected.currentSeat;
    const page = seat === 0 ? host : guest;
    const other = seat === 0 ? guest : host;
    await expect(page.getByTestId('turn-indicator')).toContainText('Your turn');
    const action = legalActions(expected, seat).find((a) => a.type === 'play');
    if (!action || action.type !== 'play') throw new Error('no play');
    await handCard(page, action.card).click();
    await expect(cell(page, action.cell)).toHaveAttribute('data-target', 'true');
    await cell(page, action.cell).click();
    expected = apply(expected, seat, action).state;
    await expect(cell(other, action.cell)).toHaveAttribute('data-chip', 'true');
    await expect(other.getByTestId('deck-count')).toHaveText(`Deck ${expected.deck.length}`);
    // Each player sees only their own hand, and hand counts stay in sync.
    expect(await handCards(host)).toEqual(expected.hands[0]);
    expect(await handCards(guest)).toEqual(expected.hands[1]);
    for (const p of [host, guest]) {
      await expect(p.locator('[data-seat="0"]')).toContainText(`${expected.hands[0]?.length}`);
      await expect(p.locator('[data-seat="1"]')).toContainText(`${expected.hands[1]?.length}`);
    }
  }
  await expect(host.getByTestId('game-log')).toContainText('played');
});

test('2. win flow: near-win state, final card, winner banner, rematch', async ({ browser }) => {
  const { host, guest } = await twoPlayerGame(browser);
  const s = clone(createGame(CFG2, [1, 2, 3, 4]));
  s.currentSeat = 0;
  for (const c of [71, 72, 73, 74, 75, 21, 22, 23, 24]) s.chips[c] = 0;
  s.lines = [{ team: 0, dir: 'H', cells: [71, 72, 73, 74, 75] }];
  s.hands[0] = ['JD', ...(s.hands[0] ?? []).slice(1)];
  await setState(host, s);
  await handCard(host, 'JD').click();
  await cell(host, 25).click();
  for (const p of [host, guest]) {
    await expect(p.getByTestId('result-banner')).toContainText('Blue team wins!');
    await expect(p.locator('[data-line]')).toHaveCount(2);
    await expect(cell(p, 23)).toContainText('locked');
  }
  await expect(guest.getByTestId('result-banner')).toContainText('Waiting for host');
  await host.getByTestId('rematch').click();
  for (const p of [host, guest]) await expect(p.getByTestId('room-code')).toBeVisible();
  await expect(host.locator('[data-seat="1"]')).toContainText('Bob');
});

test('3. cutter removes an opponent chip; locked chips cannot be cut', async ({ browser }) => {
  const { host, guest } = await twoPlayerGame(browser);
  const s = clone(createGame(CFG2, [1, 2, 3, 4]));
  s.currentSeat = 0;
  for (const c of [61, 62, 63, 64, 65]) s.chips[c] = 1;
  s.lines = [{ team: 1, dir: 'H', cells: [61, 62, 63, 64, 65] }];
  s.chips[33] = 1;
  s.hands[0] = [
    'JH',
    ...(s.hands[0] ?? []).slice(1).filter((c) => c !== 'JH' && c !== 'JS'),
    '2C',
  ].slice(0, 7) as Card[];
  await setState(host, s);
  expect(await emit(host, 'game:action', { type: 'cut', card: 'JH', cell: 63 })).toMatchObject({
    ok: false,
    code: 'CUT_LOCKED',
  });
  await handCard(host, 'JH').click();
  await expect(cell(host, 33)).toHaveAttribute('data-target', 'true');
  await expect(cell(host, 63)).toHaveAttribute('data-target', 'false');
  await cell(host, 63).click({ force: true }); // not actionable: nothing happens
  await cell(host, 33).click();
  await expect(cell(guest, 33)).toHaveAttribute('data-chip', 'false');
  await expect(cell(guest, 63)).toHaveAttribute('data-chip', 'true');
});

test('4. dead card swap', async ({ browser }) => {
  const { host, guest } = await twoPlayerGame(browser);
  const s = clone(createGame(CFG2, [1, 2, 3, 4]));
  s.currentSeat = 0;
  const [a, b] = cellsFor('8D') as [number, number];
  s.chips[a] = 0;
  s.chips[b] = 1;
  s.hands[0] = ['8D', '2C', '3C', '4C', '5C', '6C', '7C'];
  s.deck = s.deck.filter((c) => c !== 'KS');
  s.deck.push('KS'); // the next card drawn
  s.hands[1] = (s.hands[1] ?? []).slice(0, 7);
  // keep 104 cards: top up the deck with removed copies
  while (s.deck.length + s.discard.length + s.hands.flat().length < 104) s.deck.unshift('2S');
  await setState(host, s);
  await expect(handCard(host, '8D')).toHaveAttribute('data-dead', 'true');
  await host.getByRole('button', { name: 'Swap dead 8 of diamonds' }).click();
  await expect(handCard(host, 'KS')).toBeVisible();
  await expect(host.locator('[data-testid="hand-tray"] [data-card="8D"]')).toHaveCount(0);
  await expect(host.getByRole('button', { name: /Swap dead/ })).toHaveCount(0);
  await expect(host.getByTestId('turn-indicator')).toContainText('Your turn');
  await expect(guest.getByTestId('game-log')).toContainText('swapped a dead 8 of diamonds');
});

test('5. reconnect: reload restores the same seat and hand', async ({ browser }) => {
  const { host, guest } = await twoPlayerGame(browser, [5, 6, 7, 8]);
  const before = await handCards(guest);
  await guest.reload();
  await expect(guest.getByRole('grid')).toBeVisible();
  expect(await handCards(guest)).toEqual(before);
  await expect(guest.locator('[data-seat="1"]')).toContainText('(you)');
  await expect(host.locator('[data-seat="1"] [aria-label="connected"]')).toBeVisible();
});

test('6. timer: the turn is skipped on expiry', async ({ browser }) => {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);
  const url = await createRoom(host, 'Alice', 2);
  await joinByLink(guest, url, 'Bob');
  // Short test-only timer (TEST_MODE allows < 10 s).
  expect(await emit(host, 'room:config', { turnSeconds: 2 })).toMatchObject({ ok: true });
  const seed: [number, number, number, number] = [3, 1, 4, 1];
  const first = createGame({ playerCount: 2, teamCount: 2, turnSeconds: 2 }, seed).currentSeat;
  expect(await emit(host, 'room:testStart', { seed })).toMatchObject({ ok: true });
  await expect(host.getByTestId('countdown')).toBeVisible();
  const firstPage = first === 0 ? host : guest;
  const secondPage = first === 0 ? guest : host;
  await expect(firstPage.getByTestId('turn-indicator')).toContainText('Your turn');
  await expect(host.getByTestId('game-log')).toContainText('time ran out', { timeout: 6000 });
  await expect(secondPage.getByTestId('turn-indicator')).toContainText('Your turn');
});

test('7. six players, three teams: seat % 3 team assignment', async ({ browser }) => {
  const host = await newPlayer(browser);
  const url = await createRoom(host, 'P1', 6);
  await host.getByRole('radio', { name: '3 teams of 2' }).click();
  await expect(host.getByTestId('team-2')).toBeVisible();
  const others = [];
  for (let i = 2; i <= 6; i++) {
    const p = await newPlayer(browser);
    await joinByLink(p, url, `P${i}`);
    others.push(p);
  }
  for (let seat = 0; seat < 6; seat++) {
    await expect(
      host.getByTestId(`team-${seat % 3}`).locator(`[data-seat="${seat}"]`),
    ).toContainText(`P${seat + 1}`);
  }
  await host.getByTestId('start-game').click();
  for (const p of [host, ...others]) {
    await expect(p.getByRole('grid')).toBeVisible();
    for (let seat = 0; seat < 6; seat++) {
      await expect(p.locator(`[aria-label="Players"] [data-seat="${seat}"]`)).toHaveAttribute(
        'data-team',
        String(seat % 3),
      );
    }
    await expect(p.locator('[data-testid="hand-tray"] [data-card]')).toHaveCount(5);
  }
  await expect(host.getByTestId('scores')).toContainText('0/1');
  await expectNoSeriousA11yViolations(host);
});

test("9. security: received frames never contain another seat's hand", async ({ browser }) => {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);
  const frames: string[] = [];
  guest.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
  const url = await createRoom(host, 'Alice', 2);
  await joinByLink(guest, url, 'Bob');
  const seed: [number, number, number, number] = [99, 98, 97, 96];
  expect(await emit(host, 'room:testStart', { seed })).toMatchObject({ ok: true });
  let s = createGame(CFG2, seed);
  await expect(guest.getByRole('grid')).toBeVisible();
  // play a few turns through the socket so many updates are received
  for (let i = 0; i < 6; i++) {
    const seat = s.currentSeat;
    const a = legalActions(s, seat).find((x) => x.type === 'play');
    if (!a) break;
    expect(await emit(seat === 0 ? host : guest, 'game:action', a)).toMatchObject({ ok: true });
    s = apply(s, seat, a).state;
  }
  await expect(guest.getByTestId('deck-count')).toHaveText(`Deck ${s.deck.length}`);
  const updates = frames.filter((f) => f.startsWith('42["game:update"'));
  expect(updates.length).toBeGreaterThan(3);
  const forbiddenKeys = /"(hands|deck|rng|log|token)"\s*:/;
  for (const f of frames) {
    if (f.startsWith('42["session:init"')) continue; // the guest's own session token
    expect(f).not.toMatch(forbiddenKeys);
    if (!f.startsWith('42["game:update"')) continue;
    const [, payload] = JSON.parse(f.slice(2)) as [
      string,
      { view: { you: number; hand: string[] } },
    ];
    expect(payload.view.you).toBe(1);
  }
  // The host's full hand at any point never appears in what the guest received.
  const hostHand = JSON.stringify(s.hands[0]);
  expect(frames.join('\n')).not.toContain(hostHand);
  const lastView = viewFor(s, 1);
  expect(await handCards(guest)).toEqual(lastView.hand);
  expect(BOARD).toHaveLength(100);
});
