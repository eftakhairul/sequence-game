import { expect, test } from '@playwright/test';
import { apply, createGame, legalActions } from '../packages/rules/dist/index.js';
import { cell, handCard, twoPlayerGame } from './helpers.js';

test('8. mobile: board fits without horizontal scroll; two-tap confirm', async ({
  browser,
}, testInfo) => {
  const opts = testInfo.project.use;
  const seed: [number, number, number, number] = [7, 7, 7, 7];
  const { host, guest } = await twoPlayerGame(browser, seed, {
    viewport: opts.viewport ?? undefined,
    userAgent: opts.userAgent,
    deviceScaleFactor: opts.deviceScaleFactor,
    isMobile: opts.isMobile,
    hasTouch: opts.hasTouch,
  });
  const s = createGame({ playerCount: 2, teamCount: 2, turnSeconds: 0 }, seed);
  const page = s.currentSeat === 0 ? host : guest;
  const other = s.currentSeat === 0 ? guest : host;

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await page.getByRole('grid').boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);

  const action = legalActions(s, s.currentSeat).find((a) => a.type === 'play');
  if (!action || action.type !== 'play') throw new Error('no play');
  await handCard(page, action.card).tap();
  await cell(page, action.cell).tap();
  // first tap: preview only
  await expect(page.locator(`[data-cell="${action.cell}"] [data-preview]`)).toBeVisible();
  await expect(cell(other, action.cell)).toHaveAttribute('data-chip', 'false');
  // second tap: confirm
  await cell(page, action.cell).tap();
  await expect(cell(other, action.cell)).toHaveAttribute('data-chip', 'true');
  const next = apply(s, s.currentSeat, action).state;
  await expect(other.getByTestId('turn-indicator')).toContainText(
    next.currentSeat === (other === host ? 0 : 1) ? 'Your turn' : "'s turn",
  );
});
