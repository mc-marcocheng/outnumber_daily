import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from 'playwright/test';
import { compileLevel } from '../src/shared/game/level-schema';
import { commitInteraction, createSession } from '../src/shared/game/session';
import { replayWithSteps } from '../src/shared/replay';
import { toWireEvent, toWireState } from '../src/shared/wire';

const rawLevel = {
  formatVersion: 1,
  id: 'completion-fixture',
  revision: 1,
  title: 'Completion check',
  width: 3,
  terrain: ['...'],
  startCell: 0,
  startValue: '3',
  spareLives: 1,
  tiles: [
    { id: 'add', kind: 'add', cell: 1, amount: '4' },
    { id: 'boss', kind: 'boss', cell: 2, value: '6' },
  ],
};
const level = compileLevel(rawLevel);
const browser = await chromium.launch({ headless: true });
await mkdir('.shots', { recursive: true });
try {
  for (const viewport of [
    { width: 375, height: 596 },
    { width: 1280, height: 800 },
  ]) {
    let session = createSession(level);
    let allCompleted = false;
    let selectedDate: string | null = null;
    const snapshot = () => ({
      state: toWireState(session.present),
      steps: replayWithSteps(level, session.actions).steps,
      actions: session.actions.length,
    });
    const page = await browser.newPage({ viewport });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      if (pathname === '/api/init')
        return route.fulfill({
          json: {
            type: 'init',
            date: '2026-11-14',
            avatarUrl: null,
            streak: 1,
            today: {
              title: level.title,
              parSteps: 2,
              parActions: 2,
              completed: false,
              bestSteps: null,
            },
          },
        });
      if (pathname === '/api/puzzle') {
        selectedDate = url.searchParams.get('date');
        return route.fulfill({
          json: {
            type: 'puzzle',
            date: '2026-11-14',
            postDate: '2026-11-23',
            difficulty: url.searchParams.get('difficulty') ?? 'easy',
            progress: {
              easy: {
                completed: session.present.phase === 'won',
                started: true,
                bestSteps: null,
              },
              medium: {
                completed: allCompleted,
                started: false,
                bestSteps: allCompleted ? 2 : null,
              },
              hard: {
                completed: false,
                started: true,
                bestSteps: allCompleted ? 2 : null,
              },
            },
            level: rawLevel,
            ...snapshot(),
            completed: session.present.phase === 'won',
            parSteps: 2,
            parActions: 2,
            bestSteps: null,
            avatarUrl: null,
          },
        });
      }
      if (pathname === '/api/move') {
        const outcome = commitInteraction(
          level,
          session,
          route.request().postDataJSON().tileId
        );
        assert(outcome.result.ok);
        session = outcome.session;
        return route.fulfill({
          json: {
            type: 'move',
            ...snapshot(),
            completed: session.present.phase === 'won',
            event: toWireEvent(outcome.result.event),
            path: outcome.result.path,
          },
        });
      }
      if (pathname === '/api/complete')
        return route.fulfill({
          json: {
            type: 'complete',
            endCard: {
              ...snapshot(),
              parSteps: 2,
              parActions: 2,
              bestSteps: 2,
              rank: 1,
              streak: 1,
              flairMilestone: null,
            },
          },
        });
      if (pathname === '/api/leaderboard')
        return route.fulfill({
          json: { type: 'leaderboard', date: '2026-11-14', rows: [] },
        });
      throw new Error(`Unexpected request: ${pathname}`);
    });
    await page.goto(
      `${process.env.UI_BASE_URL ?? 'http://127.0.0.1:4183'}/game.html`
    );
    const levelButton = page.getByRole('button', {
      name: 'Level',
      exact: true,
    });
    await expect(levelButton).not.toHaveClass(/action-highlight/);
    await expect(page.locator('.daily-steps')).toHaveCount(0);
    await page.locator('.tile--add').click();
    await expect(
      page.getByRole('button', { name: 'Undo', exact: true })
    ).toBeEnabled();
    await page.locator('.tile--boss').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page
      .getByRole('button', { name: 'Close dialog', exact: true })
      .click();
    const resultButton = page.getByRole('button', {
      name: 'Results',
      exact: true,
    });
    await expect(resultButton).toBeVisible();
    await expect(levelButton).toHaveClass(/action-highlight/);
    const glowFrames = await levelButton.evaluate((element) => {
      const animation = element
        .getAnimations()
        .find(
          (animation) =>
            animation.id === '' &&
            animation.effect?.getTiming().duration === 3600
        );
      return animation?.effect instanceof KeyframeEffect
        ? animation.effect.getKeyframes()
        : [];
    });
    assert(glowFrames.length >= 2);
    assert(glowFrames.every((frame) => frame.transform === undefined));
    assert.notEqual(glowFrames[0]?.boxShadow, glowFrames[1]?.boxShadow);
    await expect(
      resultButton.getByText('Results', { exact: true })
    ).toBeVisible();
    const resultBackground = await resultButton.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    await resultButton.hover();
    await expect(resultButton).toHaveCSS(
      'transform',
      'matrix(1, 0, 0, 1, 0, -2)'
    );
    await expect(resultButton).toHaveCSS('background-color', resultBackground);
    await page.mouse.move(0, 0);
    const bounds = await resultButton.boundingBox();
    assert(bounds && bounds.width >= 44 && bounds.height >= 44);
    await page.getByRole('button', { name: 'Level', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Level', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('radio', { name: /^Easy.*Completed/ })
    ).toBeChecked();
    await expect(
      page.locator(
        '.difficulty-option[data-difficulty="easy"] .difficulty-mark .lucide-check'
      )
    ).toBeVisible();
    await expect(
      page.locator(
        '.difficulty-option[data-difficulty="easy"] .difficulty-mark .lucide-circle-dot'
      )
    ).toHaveCount(0);
    await expect(
      page.getByRole('radio', { name: 'Medium', exact: true })
    ).toBeEnabled();
    await page
      .getByRole('button', { name: 'Close dialog', exact: true })
      .click();
    await resultButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page
      .getByRole('button', { name: 'Close dialog', exact: true })
      .click();
    await page.screenshot({ path: `.shots/completion-${viewport.width}.png` });
    await resultButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(resultButton).toBeVisible();
    await expect(levelButton).toHaveClass(/action-highlight/);
    allCompleted = true;
    await page.reload();
    await expect(resultButton).toBeVisible();
    await expect(levelButton).not.toHaveClass(/action-highlight/);
    await levelButton.click();
    await page.getByRole('radio', { name: /^Medium/ }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    assert.equal(selectedDate, '2026-11-14');
    assert.deepEqual(errors, []);
    console.log(
      `Completion controls passed at ${viewport.width}x${viewport.height}`
    );
    await page.close();
  }
} finally {
  await browser.close();
}
