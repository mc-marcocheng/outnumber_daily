import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect, type Locator } from 'playwright/test';
import { WebViewImmersiveMode } from '@devvit/protos/json/devvit/ui/effects/web_view/v1alpha/immersive_mode.js';
import { communityCopy } from '../src/client/i18n/community-copy';
import { supportedLocales } from '../src/client/i18n/locales';

const browser = await chromium.launch({ headless: true });
async function checkPlayHover(button: Locator) {
  await expect
    .poll(() =>
      button.evaluate((element) => Number(getComputedStyle(element).opacity))
    )
    .toBe(1);
  const entranceStart = await button.evaluate(
    (element) =>
      element
        .getAnimations()
        .find(
          (animation) =>
            animation instanceof CSSAnimation &&
            animation.animationName === 'hub-play-reveal'
        )?.startTime ?? null
  );
  await button.hover();
  await expect
    .poll(() =>
      button.evaluate((element) => getComputedStyle(element).animationDuration)
    )
    .toContain('1.2s');
  await button.page().mouse.move(0, 0);
  const after = await button.evaluate((element) => ({
    opacity: Number(getComputedStyle(element).opacity),
    entranceStart:
      element
        .getAnimations()
        .find(
          (animation) =>
            animation instanceof CSSAnimation &&
            animation.animationName === 'hub-play-reveal'
        )?.startTime ?? null,
  }));
  assert.equal(after.opacity, 1, 'Hover exit must not hide Play');
  assert.equal(
    after.entranceStart,
    entranceStart,
    'Hover exit must not restart the entrance'
  );
}
await mkdir('.shots', { recursive: true });
try {
  for (const viewport of [
    { width: 320, height: 256 },
    { width: 375, height: 256 },
    { width: 1280, height: 256 },
  ]) {
    const page = await browser.newPage({ viewport });
    const errors: string[] = [];
    let videoRequests = 0;
    page.on('request', (request) => {
      if (request.url().includes('outnumber-synced.mp4')) videoRequests++;
    });
    const effects: { immersiveMode: number; entryUrl?: string }[] = [];
    await page.exposeFunction(
      'captureHubMode',
      (effect: { immersiveMode: number; entryUrl?: string }) =>
        effects.push(effect)
    );
    await page.addInitScript(
      ({ mode }) => {
        Object.defineProperty(globalThis, 'devvit', {
          configurable: true,
          value: {
            webViewMode: mode,
            entrypoints: Object.fromEntries(
              ['hub', 'intro', 'leaders', 'contribute', 'game', 'tutorial'].map(
                (entry) => [entry, `http://127.0.0.1:4183/${entry}.html`]
              )
            ),
          },
        });
        window.addEventListener('message', (event) => {
          if (
            event.data?.type === 'devvit-internal' &&
            event.data.immersiveMode
          ) {
            const capture = Reflect.get(globalThis, 'captureHubMode');
            if (typeof capture === 'function')
              void capture(event.data.immersiveMode);
          }
        });
      },
      { mode: WebViewImmersiveMode.INLINE_MODE }
    );
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      `${process.env.UI_BASE_URL ?? 'http://127.0.0.1:4183'}/hub.html`
    );
    await expect(
      page.getByRole('heading', { name: 'Outnumber', exact: true })
    ).toHaveText('utnumber');
    const header = await page.locator('.hub-hero').boundingBox();
    const navigation = await page.locator('.hub-nav').boundingBox();
    assert(
      header &&
        navigation &&
        header.height === viewport.height &&
        navigation.y >= header.y &&
        navigation.y + navigation.height <= header.y + header.height
    );
    assert(
      navigation.x >= 0 && navigation.x + navigation.width <= viewport.width
    );
    await expect(page.locator('.puzzle-builder')).toHaveCount(0);
    await expect(page.locator('.hub-game')).toHaveCount(0);
    await expect(page.getByText('Made by the community')).toHaveCount(0);
    const frontPlay = page.getByRole('button', {
      name: 'Play today',
      exact: true,
    });
    const frontFit = await frontPlay.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const tagline = document
        .querySelector('.hub-hero-copy p')!
        .getBoundingClientRect();
      const nav = document.querySelector('.hub-nav')!.getBoundingClientRect();
      return rect.top >= tagline.bottom && rect.bottom <= nav.top;
    });
    assert(frontFit, 'Front Play must fit between tagline and navigation');
    await checkPlayHover(frontPlay);
    await frontPlay.click();
    await expect.poll(() => effects.at(-1)?.entryUrl).toContain('/game.html');
    await expect(page.locator('.daily-game')).toHaveCount(0);
    effects.length = 0;
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await page
      .getByRole('button', { name: 'Close dialog', exact: true })
      .click();
    await page.screenshot({
      path: `.shots/community-inline-${viewport.width}.png`,
    });
    await page.getByRole('button', { name: 'Leaders', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Leaderboard', exact: true })
    ).toBeVisible();
    await page.getByRole('radio', { name: 'Today', exact: true }).click();
    await page.getByRole('radio', { name: 'Hard', exact: true }).click();
    await expect(
      page.getByRole('radio', { name: 'Today', exact: true })
    ).toBeChecked();
    await expect(
      page.getByRole('radio', { name: 'Hard', exact: true })
    ).toBeChecked();
    await expect(
      page.getByText('No ranked solves yet.', { exact: true })
    ).toBeVisible();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight
      ),
      'Compact leaders scrolls'
    );
    await page.screenshot({
      path: `.shots/community-leaders-${viewport.width}.png`,
    });
    assert.equal(effects.length, 0);
    await page
      .getByRole('button', { name: 'Expand community hub', exact: true })
      .click();
    await expect
      .poll(() => effects.at(-1)?.entryUrl)
      .toContain('/leaders.html');
    await page.getByRole('button', { name: 'Game', exact: true }).click();
    await expect(page.locator('.hub-play-today')).toHaveCount(0);
    await expect(
      page.getByRole('group', { name: 'Game demonstration', exact: true })
    ).toBeVisible();
    await expect
      .poll(() =>
        page.locator('.hub-game').evaluate((section) => {
          const board = section
            .querySelector('.board')!
            .getBoundingClientRect();
          const stage = section
            .querySelector('.board-viewport')!
            .getBoundingClientRect();
          return board.top >= stage.top && board.bottom <= stage.bottom + 1;
        })
      )
      .toBe(true);
    const gameFit = await page.evaluate(() => {
      const board = document
        .querySelector('.hub-game .board')
        ?.getBoundingClientRect();
      const stage = document
        .querySelector('.hub-game .board-viewport')
        ?.getBoundingClientRect();
      const button = document
        .querySelector('.hub-play-today')
        ?.getBoundingClientRect();
      return {
        scroll: document.documentElement.scrollHeight,
        height: innerHeight,
        boardTop: board?.top ?? 0,
        stageTop: stage?.top ?? 0,
        stageBottom: stage?.bottom ?? 0,
        boardBottom: board?.bottom ?? 0,
        buttonTop: button?.top ?? 0,
        buttonBottom: button?.bottom ?? 0,
        buttonHeight: button?.height ?? 0,
        cellWidth: (board?.width ?? 0) / 7,
        navigationTop:
          document.querySelector('.hub-nav')?.getBoundingClientRect().top ?? 0,
      };
    });
    assert(
      gameFit.scroll <= gameFit.height &&
        gameFit.boardTop >= gameFit.stageTop &&
        gameFit.boardBottom <= gameFit.stageBottom + 1 &&
        gameFit.cellWidth >= 34,
      JSON.stringify(gameFit)
    );
    await page.screenshot({
      path: `.shots/community-game-${viewport.width}.png`,
    });
    const effectsBeforePlay = effects.length;
    await expect(
      page.getByRole('button', { name: 'Play today', exact: true })
    ).toBeVisible({ timeout: 30000 });
    assert.equal(
      videoRequests,
      0,
      'Video must not download before Watch video'
    );
    const watchVideo = page.getByRole('button', {
      name: 'Watch video',
      exact: true,
    });
    await expect(watchVideo).toBeVisible();
    const watchBounds = await watchVideo.boundingBox();
    const playBounds = await page.locator('.hub-play-today').boundingBox();
    assert(
      watchBounds &&
        playBounds &&
        watchBounds.y + watchBounds.height <= playBounds.y
    );
    await watchVideo.click();
    await expect(
      page.getByRole('dialog', { name: 'Watch video', exact: true })
    ).toBeVisible();
    await expect
      .poll(() => page.locator('video').evaluate((video) => video.readyState))
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(() => page.locator('video').evaluate((video) => video.currentTime))
      .toBeGreaterThan(0);
    await page.screenshot({
      path: `.shots/community-video-${viewport.width}.png`,
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('video')).toHaveCount(0);
    await page.getByRole('button', { name: 'Replay', exact: true }).click();
    await expect(page.locator('.hub-play-today')).toHaveCount(0);
    await expect(watchVideo).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Play today', exact: true })
    ).toBeVisible({ timeout: 30000 });
    await checkPlayHover(
      page.getByRole('button', { name: 'Play today', exact: true })
    );
    await page.getByRole('button', { name: 'Play today', exact: true }).click();
    await expect.poll(() => effects.at(-1)?.entryUrl).toContain('/game.html');
    await expect(page.locator('.daily-game')).toHaveCount(0);
    assert.equal(effects.length, effectsBeforePlay + 1);
    await page
      .getByRole('button', { name: 'Back to front page', exact: true })
      .click();
    await expect(page.locator('.hub-game')).toHaveCount(0);
    await page.getByRole('button', { name: 'Contribute', exact: true }).click();
    await expect
      .poll(() => effects.at(-1)?.entryUrl)
      .toContain('/contribute.html');
    await expect(page.locator('.puzzle-builder')).toHaveCount(0);
    assert.deepEqual(errors, []);
    console.log(
      `Inline navigation passed at ${viewport.width}x${viewport.height}`
    );
    await page.close();
  }
  for (const viewport of [
    { width: 320, height: 596 },
    { width: 375, height: 812 },
    { width: 700, height: 768 },
    { width: 1280, height: 800 },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.addInitScript((mode) => {
      Object.defineProperty(globalThis, 'devvit', {
        configurable: true,
        value: { webViewMode: mode },
      });
    }, WebViewImmersiveMode.IMMERSIVE_MODE);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      `${process.env.UI_BASE_URL ?? 'http://127.0.0.1:4183'}/hub.html`
    );
    const canvas = page.locator('.splash-board-canvas');
    await expect
      .poll(() =>
        canvas.evaluate((element) => {
          if (!(element instanceof HTMLCanvasElement)) return false;
          const context = element.getContext('2d');
          return Boolean(
            context &&
            context
              .getImageData(0, 0, element.width, element.height)
              .data.some((value) => value > 0)
          );
        })
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Game', exact: true }).click();
    await expect(page.locator('.hub-play-today')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Play today', exact: true })
    ).toBeVisible({ timeout: 30000 });
    await expect
      .poll(() =>
        page.locator('.hub-game').evaluate((root) => {
          const board = root.querySelector('.board')!.getBoundingClientRect();
          const status = root
            .querySelector('.game-status')!
            .getBoundingClientRect();
          const play = root
            .querySelector('.hub-finished-buttons')!
            .getBoundingClientRect();
          return (
            Math.abs(
              (status.left + status.right - board.left - board.right) / 2
            ) < 2 &&
            status.bottom <= board.top &&
            Math.abs((play.top + play.bottom - board.top - board.bottom) / 2) <
              3
          );
        })
      )
      .toBe(true);
    const expandedHeaderHeight = await page
      .locator('.hub-hero')
      .evaluate((item) => item.getBoundingClientRect().height);
    for (const button of await page
      .locator('.hub-home, .hub-settings, .hub-expand')
      .all()) {
      await button.hover();
      const circle = await button.evaluate((item) => {
        const rect = item.getBoundingClientRect();
        return (
          Math.abs(rect.width - rect.height) < 1 &&
          getComputedStyle(item).borderRadius === '50%'
        );
      });
      assert(circle, 'Utility hover edge must be circular');
    }
    await page.screenshot({
      path: `.shots/community-expanded-game-${viewport.width}.png`,
    });
    await page.getByRole('button', { name: 'Leaders', exact: true }).click();
    assert.equal(
      await page
        .locator('.hub-hero')
        .evaluate((item) => item.getBoundingClientRect().height),
      expandedHeaderHeight
    );
    await page
      .getByRole('button', { name: 'Back to front page', exact: true })
      .click();
    const position = await canvas.getAttribute('data-position');
    await expect
      .poll(() => canvas.getAttribute('data-position'), { timeout: 10_000 })
      .not.toBe(position);
    await page.screenshot({
      path: `.shots/community-about-${viewport.width}.png`,
      fullPage: true,
    });
    await page.goto(
      `${process.env.UI_BASE_URL ?? 'http://127.0.0.1:4183'}/contribute.html`
    );
    await expect(
      page.getByRole('button', { name: 'Return to post', exact: true })
    ).toBeVisible();
    await expect(page.getByLabel('Puzzle title', { exact: true })).toHaveCount(
      0
    );
    await page
      .getByRole('button', { name: 'Submission limits', exact: true })
      .click();
    await expect(
      page.getByRole('dialog', { name: 'Submission limits' })
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Close dialog', exact: true })
      .click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    if (viewport.width >= 600) {
      const combined = await page
        .locator('.builder-fields')
        .evaluate((fields) => {
          const target = fields
            .querySelector('.builder-target')!
            .getBoundingClientRect();
          const mode = fields
            .querySelector('.builder-mode')!
            .getBoundingClientRect();
          return (
            Math.abs(
              (target.top + target.bottom - mode.top - mode.bottom) / 2
            ) < 2
          );
        });
      assert(combined, 'Desktop target and Edit/Test must share a row');
      const desktopControls = await page
        .locator('.builder-fields')
        .evaluate((fields) => {
          const tools = [
            ...fields.querySelectorAll('.builder-palette button'),
          ].map((button) => button.getBoundingClientRect());
          const toggle = fields
            .querySelector('.builder-mode-toggle')!
            .getBoundingClientRect();
          return (
            tools.every((rect) => Math.abs(rect.top - tools[0]!.top) < 1) &&
            toggle.width >= 160
          );
        });
      assert(
        desktopControls,
        'Desktop tools must share one row and Edit/Test needs full width'
      );
      await page
        .locator('.builder-target .difficulty-option')
        .filter({ hasText: 'Medium' })
        .click();
      const unwrapped = await page
        .locator('.builder-target .difficulty-content')
        .evaluateAll((elements) =>
          elements.every(
            (element) =>
              getComputedStyle(element).whiteSpace === 'nowrap' &&
              element.scrollWidth <= element.clientWidth + 1
          )
        );
      assert(unwrapped, 'Selected difficulty labels must not wrap or clip');
      await page
        .locator('.builder-target .difficulty-option')
        .filter({ hasText: 'Easy' })
        .click();
    }
    await page.getByLabel('Starting value', { exact: true }).fill('12');
    await page
      .getByRole('button', { name: 'Spare life 2', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Spare life 1', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', { name: 'Spare life 2', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await page
      .getByRole('button', { name: 'Spare life 1', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Spare life 1', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Spare life 1', exact: true })
    ).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.getByRole('button', { name: 'Leaders', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Leaderboard', exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Contribute', exact: true }).click();
    await expect(
      page.getByLabel('Starting value', { exact: true })
    ).toHaveValue('12');
    await page.reload();
    await page.getByRole('button', { name: 'Contribute', exact: true }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(
      page.getByLabel('Starting value', { exact: true })
    ).toHaveValue('12');
    await page.getByLabel('Starting value', { exact: true }).fill('10');
    const editingCell = await page
      .locator('.builder-cell')
      .first()
      .boundingBox();
    await page.getByRole('radio', { name: 'Test', exact: true }).check();
    await expect
      .poll(async () => {
        const playingCell = await page
          .locator('.puzzle-builder .cell')
          .first()
          .boundingBox();
        return Math.abs((playingCell?.width ?? 0) - (editingCell?.width ?? 0));
      })
      .toBeLessThanOrEqual(1);
    await page.locator('.puzzle-builder .tile--subtract').click();
    await page.locator('.puzzle-builder .tile--divide').click();
    await page.getByRole('button', { name: 'Undo move', exact: true }).click();
    await page.locator('.puzzle-builder .tile--divide').click();
    await page.locator('.puzzle-builder .tile--boss').click();
    await expect(page.locator('.builder-test-result')).toHaveText('Solved');
    await page.clock.install();
    await expect(
      page.getByRole('button', { name: 'Submit', exact: true })
    ).toBeDisabled();
    await expect(page.locator('.puzzle-builder blockquote')).toContainText(
      'Assess this puzzle before submitting'
    );
    await page.getByRole('button', { name: 'Assess', exact: true }).click();
    await expect(
      page.locator('.puzzle-builder .builder-assessment')
    ).toContainText('Below daily criteria');
    await expect(
      page.getByRole('button', { name: 'Assess', exact: true })
    ).toBeDisabled();
    await expect(page.locator('.builder-cooldown')).toContainText('30 seconds');
    await page.clock.fastForward(30_100);
    await expect(
      page.getByRole('button', { name: 'Submit', exact: true })
    ).toBeDisabled();
    await expect(page.locator('.puzzle-builder blockquote')).toContainText(
      'Add meaningful choices'
    );
    let measured = false;
    let assessmentError = false;
    let submissionRateLimited = true;
    let submitted: Record<string, unknown> | null = null;
    await page.route('**/api/community/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace('/api/community', '');
      const method = route.request().method();
      if (path === '/assess') {
        if (assessmentError) {
          await route.fulfill({
            status: 400,
            json: { message: 'Printed values must be below 1,000.' },
          });
          return;
        }
        await route.fulfill({
          json: {
            assessment: measured
              ? {
                  status: 'assessed',
                  difficulty: 'easy',
                  minimumActions: 5,
                  meaningfulForks: 2,
                }
              : {
                  status: 'needs-review',
                  difficulty: null,
                  minimumActions: null,
                  meaningfulForks: null,
                },
          },
        });
      } else if (path === '/submit') {
        if (submissionRateLimited) {
          submissionRateLimited = false;
          await route.fulfill({
            status: 429,
            json: {
              message:
                'Wait 30 seconds before requesting another assessment or submission.',
              retryAfterSeconds: 30,
            },
          });
          return;
        }
        submitted = {
          ...route.request().postDataJSON(),
          id: 'browser-submission',
          author: 'Local player',
          authorId: 't2_local',
          submittedAt: new Date().toISOString(),
          status: 'submitted',
          steps: 3,
          assessment: {
            status: 'assessed',
            difficulty: 'easy',
            minimumActions: 5,
            meaningfulForks: 2,
          },
        };
        await route.fulfill({ json: { submission: submitted } });
      } else if (
        path === '/submissions' ||
        (path === '/review' && method === 'GET')
      ) {
        await route.fulfill({
          json: {
            submissions:
              submitted &&
              (path !== '/review' ||
                submitted.status ===
                  (url.searchParams.get('status') ?? 'submitted'))
                ? [submitted]
                : [],
          },
        });
      } else if (path === '/review' && method === 'POST') {
        if (submitted) {
          const review = route.request().postDataJSON();
          submitted.status = review.status;
          if (review.status === 'rejected')
            submitted.declineReason = review.declineReason;
          else delete submitted.declineReason;
        }
        await route.fulfill({ json: { submission: submitted } });
      } else if (path === '/withdraw') {
        submitted = null;
        await route.fulfill({ json: {} });
      } else await route.continue();
    });
    assessmentError = true;
    await page.getByRole('button', { name: 'Assess', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Printed values must be below'
    );
    await expect(
      page.getByRole('button', { name: 'Submit', exact: true })
    ).toBeDisabled();
    await expect(page.locator('.puzzle-builder blockquote')).toContainText(
      'Fix the issue above'
    );
    assessmentError = false;
    await page.getByRole('button', { name: 'Assess', exact: true }).click();
    await expect(page.locator('.builder-assessment')).toContainText(
      'Needs review'
    );
    await page.clock.fastForward(30_100);
    await expect(
      page.getByRole('button', { name: 'Submit', exact: true })
    ).toBeDisabled();
    await expect(page.locator('.puzzle-builder blockquote')).toContainText(
      'could not measure'
    );
    measured = true;
    await page.getByRole('button', { name: 'Assess', exact: true }).click();
    await expect(page.locator('.builder-cooldown')).toContainText('30 seconds');
    await expect(
      page.getByRole('button', { name: 'Submit', exact: true })
    ).toBeDisabled();
    await page.clock.fastForward(29_000);
    await expect(
      page.getByRole('button', { name: 'Submit', exact: true })
    ).toBeDisabled();
    await page.clock.fastForward(1_100);
    await expect(
      page.getByRole('button', { name: 'Submit', exact: true })
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Undo move', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Submit', exact: true })
    ).toBeDisabled();
    await expect(page.locator('.builder-assessment')).toHaveCount(0);
    await page.locator('.puzzle-builder .tile--boss').click();
    await expect(page.locator('.builder-test-result')).toHaveText('Solved');
    await expect(
      page.getByRole('button', { name: 'Submit', exact: true })
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Assess', exact: true }).click();
    await expect(page.locator('.builder-cooldown')).toBeVisible();
    await page.clock.fastForward(30_100);
    await expect(
      page.getByRole('button', { name: 'Submit', exact: true })
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Submit puzzle' })
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Close dialog', exact: true })
      .click();
    await expect(page.locator('.builder-test-result')).toHaveText('Solved');
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await page
      .getByLabel('Puzzle title', { exact: true })
      .fill(`Browser check ${viewport.width}`);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Submit', exact: true })
      .click();
    await expect(page.locator('.builder-cooldown')).toContainText('30 seconds');
    await expect(page.locator('.builder-assessment')).toContainText(
      'Measured difficulty'
    );
    await expect(
      page
        .getByRole('dialog')
        .getByRole('button', { name: 'Submit', exact: true })
    ).toBeDisabled();
    await page
      .getByRole('button', { name: 'Close dialog', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('Wait 30 seconds');
    await expect(page.locator('.puzzle-builder blockquote')).toHaveCount(0);
    await page.clock.fastForward(30_100);
    await expect(
      page.getByRole('button', { name: 'Submit', exact: true })
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.getByLabel('Puzzle title', { exact: true })).toHaveValue(
      `Browser check ${viewport.width}`
    );
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Submit', exact: true })
      .click();
    await expect(
      page.getByText('Submitted privately for moderator review.', {
        exact: true,
      })
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Submissions', exact: true })
      .click();
    await expect(page.locator('.puzzle-builder')).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Submission limits', exact: true })
    ).toBeHidden();
    await page
      .getByRole('button', { name: 'Review queue', exact: true })
      .click();
    const submission = page.locator('.hub-submission').filter({
      has: page.getByRole('heading', {
        name: `Browser check ${viewport.width}`,
        exact: true,
      }),
    });
    await submission.getByText('Inspect puzzle', { exact: true }).click();
    await submission
      .getByRole('button', { name: 'Next action', exact: true })
      .click();
    await expect(submission.locator('.hub-controls').first()).toContainText(
      '1 / 3'
    );
    await submission.getByRole('radio', { name: 'Test', exact: true }).click();
    await submission.screenshot({
      path: `.shots/community-inspection-${viewport.width}.png`,
    });
    await submission.locator('.tile--subtract').click();
    await submission
      .getByRole('button', { name: 'Undo move', exact: true })
      .click();
    await submission.locator('.tile--subtract').click();
    await submission.locator('.tile--divide').click();
    await submission.locator('.tile--boss').click();
    await expect(submission.getByRole('status')).toHaveText('Solved');
    await submission
      .getByRole('button', { name: 'Restart test', exact: true })
      .click();
    await expect(submission.locator('.tile--boss')).toBeVisible();
    await submission
      .getByRole('radio', { name: 'Solution', exact: true })
      .click();
    await expect(submission.locator('.hub-controls').first()).toContainText(
      '1 / 3'
    );
    await submission
      .getByRole('button', { name: 'Decline', exact: true })
      .click();
    await expect(
      page
        .getByRole('dialog')
        .getByRole('button', { name: 'Decline', exact: true })
    ).toBeDisabled();
    await page
      .getByLabel('Reason for contributor', { exact: true })
      .fill('Try adding another meaningful choice.');
    await page
      .getByRole('dialog')
      .screenshot({ path: `.shots/community-decline-${viewport.width}.png` });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Decline', exact: true })
      .click();
    await page.getByRole('button', { name: 'Declined', exact: true }).click();
    await expect(submission).toContainText(
      'Try adding another meaningful choice.'
    );
    await page.getByRole('button', { name: 'Mine', exact: true }).click();
    await expect(submission).toContainText(
      'Try adding another meaningful choice.'
    );
    await page.getByRole('button', { name: 'Declined', exact: true }).click();
    await submission
      .getByRole('button', { name: 'Shortlist', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Shortlisted', exact: true })
      .click();
    await expect(submission).toContainText(
      'Shortlisted for offline certification'
    );
    await expect(submission).not.toContainText(
      'Try adding another meaningful choice.'
    );
    await page.getByRole('button', { name: 'Mine', exact: true }).click();
    await submission
      .getByRole('button', { name: 'Withdraw', exact: true })
      .click();
    await expect(submission).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Back to editor', exact: true })
      .click();
    await page.getByRole('radio', { name: 'Edit', exact: true }).check();
    await page
      .locator('.builder-target .difficulty-option')
      .filter({ hasText: 'Hard' })
      .click();
    await expect(
      page.getByRole('radio', { name: 'Hard', exact: true })
    ).toBeChecked();
    await page.getByRole('button', { name: 'Add column', exact: true }).click();
    await page.getByRole('button', { name: 'Add column', exact: true }).click();
    await page.getByRole('button', { name: 'Add row', exact: true }).click();
    await page.getByRole('button', { name: 'Add row', exact: true }).click();
    await expect(page.locator('.builder-cell')).toHaveCount(42);
    await expect(
      page.getByRole('button', { name: 'Add column', exact: true })
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Add row', exact: true })
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Remove row', exact: true }).click();
    await expect(page.locator('.builder-cell')).toHaveCount(36);
    await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
    await expect(page.locator('.builder-cell')).toHaveCount(42);
    await page.getByRole('button', { name: 'Enemy', exact: true }).click();
    await page.getByLabel('Tile value', { exact: true }).fill('999');
    await page
      .getByRole('button', { name: 'Row 7, column 6: floor', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'Row 7, column 6: enemy 999',
        exact: true,
      })
    ).toBeVisible();
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      badCells: [...document.querySelectorAll('.builder-cell')].filter(
        (element) => {
          const box = element.getBoundingClientRect();
          return (
            Math.abs(box.width - box.height) > 1 ||
            element.scrollWidth > element.clientWidth + 1
          );
        }
      ).length,
      badTools: [
        ...document.querySelectorAll('.builder-palette button span'),
      ].filter(
        (element) =>
          element.scrollHeight > element.clientHeight + 1 ||
          element.scrollWidth > element.clientWidth + 1
      ).length,
      nonSquareTools: [
        ...document.querySelectorAll('.builder-palette button'),
      ].filter((element) => {
        const rect = element.getBoundingClientRect();
        return Math.abs(rect.width - rect.height) > 1;
      }).length,
    }));
    assert.deepEqual(layout, {
      overflow: false,
      badCells: 0,
      badTools: 0,
      nonSquareTools: 0,
    });
    await page.screenshot({
      path: `.shots/community-builder-${viewport.width}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Leaders', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Leaderboard', exact: true })
    ).toBeVisible();
    await page.getByRole('radio', { name: 'Today', exact: true }).click();
    await page.getByRole('radio', { name: 'Hard', exact: true }).click();
    await expect(
      page.getByText('No ranked solves yet.', { exact: true })
    ).toBeVisible();
    assert.deepEqual(errors, []);
    console.log(
      `Community workflow and layout passed at ${viewport.width}x${viewport.height}`
    );
    await page.close();
  }
  for (const locale of supportedLocales) {
    for (const width of [320, 600, 700, 724, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 596 } });
      await page.addInitScript(
        ({ locale, mode }) => {
          localStorage.setItem('outnumber-language', locale);
          Object.defineProperty(globalThis, 'devvit', {
            configurable: true,
            value: { webViewMode: mode },
          });
        },
        { locale, mode: WebViewImmersiveMode.IMMERSIVE_MODE }
      );
      const copy = communityCopy[locale];
      await page.goto('http://127.0.0.1:4183/hub.html');
      await expect(
        page.getByText(copy['A daily numbers puzzle.']!, { exact: true })
      ).toBeVisible();
      await page.getByRole('button', { name: copy.Game!, exact: true }).click();
      await expect(
        page.getByRole('button', { name: copy['Play today']!, exact: true })
      ).toHaveCount(0);
      await page
        .getByRole('button', { name: copy['Back to front page']!, exact: true })
        .click();
      await page
        .getByRole('button', { name: copy.Leaders!, exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: copy.Leaderboard!, exact: true })
      ).toBeVisible();
      await page
        .getByRole('button', { name: copy.Contribute!, exact: true })
        .click();
      await expect(
        page.getByRole('heading', {
          name: copy['Build a puzzle']!,
          exact: true,
        })
      ).toBeVisible();
      await page
        .getByRole('button', { name: copy['Submission limits']!, exact: true })
        .click();
      await expect(page.getByRole('dialog')).toContainText(
        copy['One boss, connected floor, and a winning test run.']!
      );
      await page.keyboard.press('Escape');
      for (const tool of [
        'Floor',
        'Wall',
        'Start',
        'Enemy',
        'Window enemy',
        'Boss',
        'Add',
        'Subtract',
        'Multiply',
        'Divide',
        'Set',
      ]) {
        await page
          .getByRole('button', { name: copy[tool]!, exact: true })
          .click();
        const fit = await page.locator('.builder-palette').evaluate((palette) =>
          [...palette.querySelectorAll('button')].map((button) => {
            const rect = button.getBoundingClientRect();
            const icon = button.querySelector('svg')!.getBoundingClientRect();
            const label = button.querySelector('span')?.getBoundingClientRect();
            const top = label ? Math.min(icon.top, label.top) : icon.top;
            const bottom = label
              ? Math.max(icon.bottom, label.bottom)
              : icon.bottom;
            return {
              square: Math.abs(rect.width - rect.height) <= 1,
              compact: rect.width <= 40,
              horizontal:
                Math.abs(
                  (icon.left + icon.right) / 2 - (rect.left + rect.right) / 2
                ) <= 1,
              vertical:
                Math.abs((top + bottom) / 2 - (rect.top + rect.bottom) / 2) <=
                1,
              fits:
                top >= rect.top &&
                bottom <= rect.bottom &&
                button.scrollWidth <= button.clientWidth + 1 &&
                button.scrollHeight <= button.clientHeight + 1,
            };
          })
        );
        assert(
          fit.every(
            (item) =>
              item.square &&
              item.compact &&
              item.horizontal &&
              item.vertical &&
              item.fits
          ),
          JSON.stringify({ locale, width, tool, fit })
        );
      }
      await page
        .getByRole('button', { name: copy.Enemy!, exact: true })
        .click();
      const values = page.locator('.builder-player-controls');
      await expect(
        values.getByLabel(copy['Starting value']!, { exact: true })
      ).toHaveCount(0);
      await expect(
        values.getByLabel(copy['Tile value']!, { exact: true })
      ).toBeVisible();
      await page
        .getByRole('button', { name: copy.Start!, exact: true })
        .click();
      await expect(
        values.getByLabel(copy['Starting value']!, { exact: true })
      ).toBeVisible();
      await expect(
        values.getByLabel(copy['Tile value']!, { exact: true })
      ).toHaveCount(0);
      await page.screenshot({
        path: `.shots/community-editor-${locale}-${width}.png`,
        fullPage: true,
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth
      );
      assert(!overflow, `${locale} editor overflow at ${width}`);
      await page
        .getByRole('button', { name: copy.Settings!, exact: true })
        .hover();
      await expect
        .poll(() =>
          page
            .getByRole('button', { name: copy.Settings!, exact: true })
            .evaluate((button) => {
              const style = getComputedStyle(button);
              const probe = document.createElement('span');
              button.append(probe);
              probe.style.color = 'var(--color-floor-edge)';
              const edge = getComputedStyle(probe).color;
              probe.style.color = 'var(--color-nav-selected)';
              const background = getComputedStyle(probe).color;
              probe.style.color = 'var(--color-accent)';
              const accent = getComputedStyle(probe).color;
              probe.remove();
              return (
                style.borderRadius === '50%' &&
                style.borderTopColor === edge &&
                style.backgroundColor === background &&
                style.color === accent
              );
            })
        )
        .toBe(true);
      await page.setViewportSize({ width, height: 256 });
      await page.getByRole('button', { name: copy.Game!, exact: true }).click();
      await expect(
        page.getByRole('button', { name: copy['Play today']!, exact: true })
      ).toBeVisible({ timeout: 30000 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight
        ),
        `${locale} Game scrolls`
      );
      await expect
        .poll(() =>
          page.locator('.hub-game').evaluate((section) => {
            const board = section
              .querySelector('.board')!
              .getBoundingClientRect();
            const stage = section
              .querySelector('.board-viewport')!
              .getBoundingClientRect();
            return board.top >= stage.top && board.bottom <= stage.bottom + 1;
          })
        )
        .toBe(true);
      const compactGame = await page
        .locator('.hub-game')
        .evaluate((section) => {
          const board = section
            .querySelector('.board')!
            .getBoundingClientRect();
          const status = section
            .querySelector(
              innerWidth >= 520 ? '.tutorial-playback-rail' : '.game-status'
            )!
            .getBoundingClientRect();
          const play = section
            .querySelector('.hub-finished-buttons')!
            .getBoundingClientRect();
          return {
            railCentered:
              innerWidth < 520 ||
              [
                ...section.querySelectorAll(
                  '.status-slot, .tutorial-route-controls'
                ),
              ].every((item) => {
                const rect = item.getBoundingClientRect();
                return (
                  Math.abs(
                    (rect.left + rect.right - status.left - status.right) / 2
                  ) < 1
                );
              }),
            centered:
              innerWidth >= 520
                ? Math.abs(
                    (status.top + status.bottom - board.top - board.bottom) / 2
                  ) <= 2
                : Math.abs(
                    (status.left + status.right - board.left - board.right) / 2
                  ) <= 2,
            headerFits:
              Math.abs(
                (play.top + play.bottom - board.top - board.bottom) / 2
              ) <= 3 &&
              Math.abs(
                (play.left + play.right - board.left - board.right) / 2
              ) <= 3,
            cell: board.width / 7,
          };
        });
      assert(
        compactGame.centered &&
          compactGame.railCentered &&
          compactGame.headerFits &&
          compactGame.cell >= 34,
        JSON.stringify({ locale, width, compactGame })
      );
      await page.screenshot({
        path: `.shots/community-game-${locale}-${width}.png`,
      });
      await page
        .getByRole('button', { name: copy.Leaders!, exact: true })
        .click();
      await page.getByRole('radio', { name: copy.Today!, exact: true }).click();
      await page
        .getByRole('radio', { name: communityCopy[locale].Hard!, exact: true })
        .click();
      await expect(
        page.getByRole('radio', { name: copy.Today!, exact: true })
      ).toBeChecked();
      const leadersFit = await page
        .locator('.hub-filters')
        .evaluate((filters) =>
          [...filters.querySelectorAll('button')].every((button) => {
            const rect = button.getBoundingClientRect();
            return (
              rect.bottom <= innerHeight &&
              rect.left >= 0 &&
              rect.right <= innerWidth &&
              button.scrollWidth <= button.clientWidth + 1
            );
          })
        );
      assert(
        leadersFit,
        `${locale} compact leader toggles do not fit at ${width}`
      );
      await page.screenshot({
        path: `.shots/community-leaders-${locale}-${width}.png`,
      });
      console.log(
        `Translated hub and centered tools passed: ${locale}, ${width}px`
      );
      await page.close();
    }
  }
} finally {
  await browser.close();
}
