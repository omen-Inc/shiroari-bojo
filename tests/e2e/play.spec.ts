import { expect, test, type Page } from '@playwright/test';

const shot = (page: Page, name: string, fullPage = true) =>
  page.screenshot({ path: `test-results/screenshots/${test.info().project.name}-${name}.png`, fullPage });

async function waitMyTurn(page: Page) {
  await expect
    .poll(async () => (await page.getByTestId('result').count()) > 0 || (await page.getByTestId('turn-owner').textContent()) === 'あなたの番')
    .toBe(true);
}

/** 自分の手番で1手指す。指せたら true、指せる手がなければ false */
async function playOne(page: Page): Promise<boolean> {
  const card = page.locator('[data-testid="hand-card"][data-usable="true"]').first();
  if ((await card.count()) === 0) return false;
  await card.click();
  const use = page.getByTestId('use-card');
  if ((await use.count()) > 0) {
    await use.click();
    return true;
  }
  await page.locator('.point.targetable').first().click();
  return true;
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('ページが開き、陣営を選んで1手指せる', async ({ page }) => {
  await page.goto('./?cpuDelay=0&seed=3');
  await expect(page.getByRole('heading', { name: 'シロアリボージョ(仮)' })).toBeVisible();
  await noHorizontalOverflow(page);
  await shot(page, '01-title');

  await page.getByTestId('choose-termite').click();
  await expect(page.getByTestId('board')).toBeVisible();
  await waitMyTurn(page);
  await shot(page, '02-game-start');

  const before = await page.getByTestId('log').textContent();
  await page.locator('[data-testid="hand-card"][data-usable="true"]').first().click();
  await expect(page.locator('.point.targetable').first()).toBeVisible();
  await shot(page, '03-card-selected');
  await page.locator('.point.targetable').first().click();
  await expect(page.getByTestId('log')).not.toHaveText(before ?? '');
  await expect(page.getByTestId('ap')).toHaveText('●●○');
  await expect(page.getByTestId('hand-card')).toHaveCount(4);
  await noHorizontalOverflow(page);
  await shot(page, '04-after-one-move');
});

for (const side of ['termite', 'pest'] as const) {
  test(`${side === 'termite' ? 'シロアリ側' : '防除業者側'}で CPU と最後まで対戦できる`, async ({ page }) => {
    await page.goto(`./?cpuDelay=0&seed=${side === 'termite' ? 11 : 12}`);
    await page.getByTestId(`choose-${side}`).click();
    for (let i = 0; i < 3000; i++) {
      await waitMyTurn(page);
      if ((await page.getByTestId('result').count()) > 0) break;
      if (await playOne(page)) continue;
      // 1枚も使えないターンは、手詰まり防止で1枚捨てて引き直す
      if ((await page.getByTestId('redraw').count()) > 0) {
        await page.getByTestId('redraw').click();
        await page.getByTestId('hand-card').first().click();
      } else {
        await page.getByTestId('end-turn').click();
      }
    }
    await expect(page.getByTestId('result')).toBeVisible();
    await expect(page.getByTestId('result')).not.toContainText('引き分け');
    await noHorizontalOverflow(page);
    await shot(page, `05-result-${side}`, false);
    await page.getByTestId('restart').click();
    await expect(page.getByTestId('choose-termite')).toBeVisible();
  });
}
