import AxeBuilder from '@axe-core/playwright';
import { expect, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import type { GameState } from '../packages/rules/dist/index.js';

export type Ack = { ok: boolean; code?: string; [k: string]: unknown };

/** Emits on the page's own Socket.IO connection (exposed as window.__lineupSocket). */
export async function emit(page: Page, event: string, payload: unknown = {}): Promise<Ack> {
  return page.evaluate(
    async ([e, p]) => {
      const s = (
        window as unknown as {
          __lineupSocket: { emitWithAck: (e: string, p: unknown) => Promise<unknown> };
        }
      ).__lineupSocket;
      return (await s.emitWithAck(e as string, p)) as Ack;
    },
    [event, payload] as const,
  );
}

export async function newPlayer(browser: Browser, opts: BrowserContextOptions = {}): Promise<Page> {
  const context = await browser.newContext(opts);
  return context.newPage();
}

/** Host creates a room via the UI and returns the invite URL shown in the lobby. */
export async function createRoom(
  page: Page,
  name: string,
  playerCount: 2 | 4 | 6 = 2,
): Promise<string> {
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByTestId('create-room').click();
  await expect(page).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
  await expect(page.getByTestId('room-code')).toBeVisible();
  if (playerCount !== 4) {
    await page.getByRole('radio', { name: String(playerCount), exact: true }).click();
    await expect(
      page.getByRole('radio', { name: String(playerCount), exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
  }
  return (await page.getByTestId('invite-url').textContent()) as string;
}

/** Opens a share link with no stored name: prompts for a name, then auto-joins. */
export async function joinByLink(page: Page, url: string, name: string): Promise<void> {
  await page.goto(url);
  await page.getByLabel('Your name').fill(name);
  await page.getByTestId('join-with-name').click();
  await expect(page.getByTestId('room-code')).toBeVisible();
}

export async function twoPlayerGame(
  browser: Browser,
  seed: [number, number, number, number] = [1, 2, 3, 4],
  opts: BrowserContextOptions = {},
) {
  const host = await newPlayer(browser, opts);
  const guest = await newPlayer(browser, opts);
  const url = await createRoom(host, 'Alice', 2);
  await joinByLink(guest, url, 'Bob');
  await expect(host.locator('[data-seat="1"]')).toContainText('Bob');
  expect(await emit(host, 'room:testStart', { seed })).toMatchObject({ ok: true });
  await expect(host.getByRole('grid')).toBeVisible();
  await expect(guest.getByRole('grid')).toBeVisible();
  return { host, guest, url };
}

export async function handCards(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid="hand-tray"] [data-card]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-card') as string));
}

export async function setState(page: Page, state: GameState): Promise<void> {
  expect(await emit(page, 'game:testSetState', { state })).toMatchObject({ ok: true });
}

export const cell = (page: Page, i: number) => page.locator(`[data-cell="${i}"]`);
export const handCard = (page: Page, card: string) =>
  page.locator(`[data-testid="hand-tray"] [data-card="${card}"]`).first();

export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}
