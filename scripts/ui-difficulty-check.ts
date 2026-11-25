import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect, type Page } from 'playwright/test';
import { z } from 'zod';
import { loadSeason } from '../tools/season-files';
import { darkThemes, lightThemes } from '../src/client/app/theme-palettes';
import { compileLevel } from '../src/shared/game/level-schema';
import {
  commitInteraction,
  createSession,
  undo,
} from '../src/shared/game/session';
import { replayWithSteps } from '../src/shared/replay';
import {
  DIFFICULTIES,
  DIFFICULTY_TIERS,
  type Difficulty,
} from '../src/shared/season';
import { toWireEvent, toWireState } from '../src/shared/wire';

const baseUrl = process.env.UI_BASE_URL ?? 'http://127.0.0.1:4174';
const output = '.shots/difficulty';
const postDate = '2026-11-21';
const fixture = {
  formatVersion: 1,
  id: 'difficulty-ui-fixture',
  revision: 1,
  title: 'Difficulty regression',
  width: 5,
  terrain: ['.....'],
  startCell: 0,
  startValue: '3',
  spareLives: 1,
  tiles: [
    { id: 'add', kind: 'add', cell: 1, amount: '4' },
    { id: 'boss', kind: 'boss', cell: 3, value: '6' },
  ],
};
const identitySchema = z.object({
  date: z.iso.date(),
  difficulty: z.enum(DIFFICULTIES),
});
const moveSchema = identitySchema.extend({ tileId: z.string() });
const browser = await chromium.launch({ headless: true });
const checks: string[] = [];
const errors: string[] = [];
const requests: {
  path: string;
  date: string;
  difficulty: Difficulty;
  month?: string;
}[] = [];
const paletteResults: unknown[] = [];
const layouts: unknown[] = [];
let activePage: Page | undefined;
await mkdir(output, { recursive: true });

async function prepare(page: Page) {
  activePage = page;
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

function selector(page: Page) {
  return page.getByRole('dialog').locator('.difficulty-selector');
}

async function openLevel(page: Page, locale = 'en') {
  if (!(await selector(page).isVisible())) {
    const button =
      locale === 'en'
        ? page.getByRole('button', { name: 'Level', exact: true })
        : page.locator('.game-toolbar button').last();
    await button.click();
  }
  if (locale === 'en')
    await expect(
      page.getByRole('dialog', { name: 'Level', exact: true })
    ).toBeVisible();
  await expect(selector(page)).toBeVisible();
}

async function choose(page: Page, difficulty: Difficulty) {
  await openLevel(page);
  const option = selector(page).locator(`[data-difficulty="${difficulty}"]`);
  await expect(option.locator('input')).toBeEnabled();
  await option.click();
}

async function ready(page: Page, difficulty: Difficulty, steps: number) {
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Level', exact: true })
  ).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('outnumber-difficulty'))
    )
    .toBe(difficulty);
  await expect(page.locator('.daily-game > .daily-steps')).toHaveText(
    new RegExp(`^${steps}\\s*steps`)
  );
  await expect(page.locator('.player-overlay')).toHaveCount(0);
}

async function noAggregate(page: Page) {
  const text = await page.locator('body').innerText();
  assert(
    !/\b\d+\s*(?:\/\s*3|of\s+3)\s*(?:solved|completed)|total\s+(?:solved|completed)|(?:solved|completed)\s*:\s*\d+\s*\/\s*3/i.test(
      text
    ),
    'No aggregate completion count'
  );
}

try {
  const page = await browser.newPage({
    viewport: { width: 375, height: 596 },
    colorScheme: 'light',
  });
  await prepare(page);
  const level = compileLevel(fixture);
  const sessions = new Map<string, ReturnType<typeof createSession>>();
  const bests = new Map<string, number>([[`${postDate}:medium`, 3]]);
  const current = (date: string, difficulty: Difficulty) => {
    const key = `${date}:${difficulty}`;
    const session = sessions.get(key) ?? createSession(level);
    sessions.set(key, session);
    return session;
  };
  const snapshot = (date: string, difficulty: Difficulty) => {
    const session = current(date, difficulty);
    return {
      state: toWireState(session.present),
      actions: session.actions.length,
      steps: replayWithSteps(level, session.actions).steps,
    };
  };
  const progress = (date: string, difficulty: Difficulty) => ({
    completed: bests.has(`${date}:${difficulty}`),
    started: current(date, difficulty).actions.length > 0,
    bestSteps: bests.get(`${date}:${difficulty}`) ?? null,
  });
  let rejectHard = true;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const difficulty = z
      .enum(DIFFICULTIES)
      .parse(url.searchParams.get('difficulty') ?? 'easy');
    const date = url.searchParams.get('date') ?? postDate;
    if (path === '/api/puzzle') {
      requests.push({ path, date, difficulty });
      if (difficulty === 'hard' && rejectHard) {
        rejectHard = false;
        return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
      }
      return route.fulfill({
        json: {
          type: 'puzzle',
          date,
          postDate,
          difficulty,
          progress: {
            easy: progress(date, 'easy'),
            medium: progress(date, 'medium'),
            hard: progress(date, 'hard'),
          },
          level: fixture,
          ...snapshot(date, difficulty),
          completed: current(date, difficulty).present.phase === 'won',
          bestSteps: bests.get(`${date}:${difficulty}`) ?? null,
          parActions: 2,
          parSteps: 3,
          avatarUrl: null,
          hintSolution: ['add', 'boss'],
        },
      });
    }
    if (path === '/api/archive') {
      const month = z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .parse(url.searchParams.get('month'));
      requests.push({ path, date, difficulty, month });
      return route.fulfill({
        json: {
          type: 'archive',
          difficulty,
          month,
          today: postDate,
          firstDate: '2026-10-01',
          days: Array.from(
            { length: month === '2026-10' ? 31 : 21 },
            (_, index) => {
              const day = `${month}-${String(index + 1).padStart(2, '0')}`;
              return { date: day, ...progress(day, difficulty) };
            }
          ),
        },
      });
    }
    if (path === '/api/move' || path === '/api/undo') {
      const identity = identitySchema.parse(route.request().postDataJSON());
      requests.push({ path, ...identity });
      const key = `${identity.date}:${identity.difficulty}`;
      if (path === '/api/undo') {
        sessions.set(key, undo(current(identity.date, identity.difficulty)));
        return route.fulfill({
          json: {
            type: 'undo',
            ...snapshot(identity.date, identity.difficulty),
          },
        });
      }
      const move = moveSchema.parse(route.request().postDataJSON());
      const outcome = commitInteraction(
        level,
        current(move.date, move.difficulty),
        move.tileId
      );
      assert(outcome.result.ok);
      sessions.set(key, outcome.session);
      return route.fulfill({
        json: {
          type: 'move',
          ...snapshot(move.date, move.difficulty),
          event: toWireEvent(outcome.result.event),
          path: outcome.result.path,
          completed: false,
        },
      });
    }
    if (path === '/api/init')
      return route.fulfill({
        json: {
          type: 'init',
          date: postDate,
          avatarUrl: null,
          streak: 0,
          today: {
            title: level.title,
            parSteps: 3,
            parActions: 2,
            completed: false,
            bestSteps: null,
          },
        },
      });
    throw new Error(`Unexpected API request: ${path}`);
  });
  await page.goto(`${baseUrl}/game.html`);
  await ready(page, 'easy', 0);
  assert.equal(
    await page.evaluate(() => localStorage.getItem('outnumber-difficulty')),
    'easy'
  );
  await openLevel(page);
  await selector(page).locator('input[value="easy"]').focus();
  await page.keyboard.press('ArrowRight');
  await ready(page, 'medium', 0);
  await openLevel(page);
  await selector(page).locator('input[value="medium"]').focus();
  await page.keyboard.press('ArrowLeft');
  await ready(page, 'easy', 0);
  checks.push('Native radio keyboard navigation opens the selected difficulty');
  await page
    .getByRole('group', { name: `${level.title} puzzle board`, exact: true })
    .getByRole('button', { name: /row 1, column 2, reachable/ })
    .click();
  await ready(page, 'easy', 1);
  await choose(page, 'medium');
  await ready(page, 'medium', 0);
  await openLevel(page);
  await expect(
    selector(page).locator('[data-difficulty="easy"] .difficulty-mark svg')
  ).toHaveCount(1);
  await expect(
    selector(page).locator('[data-difficulty="medium"]')
  ).toContainText('Completed');
  await expect(selector(page).locator('input[value="medium"]')).toBeChecked();
  await page.keyboard.press('Escape');
  await ready(page, 'medium', 0);
  await page
    .getByRole('group', { name: `${level.title} puzzle board`, exact: true })
    .getByRole('button', { name: /row 1, column 2, reachable/ })
    .click();
  await ready(page, 'medium', 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await ready(page, 'medium', 0);
  await choose(page, 'easy');
  await ready(page, 'easy', 1);
  assert.equal(current(postDate, 'medium').actions.length, 0);
  checks.push(
    'Independent date+difficulty moves, undo, saved progress and recorded best'
  );
  await choose(page, 'hard');
  await expect(page.getByRole('alert')).toBeVisible();
  assert.equal(
    await page.evaluate(() => localStorage.getItem('outnumber-difficulty')),
    'easy'
  );
  await page.reload();
  await ready(page, 'easy', 1);
  await choose(page, 'hard');
  await ready(page, 'hard', 0);
  await page.reload();
  await ready(page, 'hard', 0);
  checks.push(
    'Only successful difficulty loads persist, and reload restores the post date'
  );

  await page
    .getByRole('button', { name: 'Puzzle archive', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('input[value="hard"]')).toBeChecked();
  await expect(dialog.locator('.archive-calendar')).toHaveAttribute(
    'aria-busy',
    'false'
  );
  await dialog
    .getByRole('button', { name: 'Previous month', exact: true })
    .click();
  await expect(dialog.locator('.archive-month')).toHaveText('October 2026');
  await expect(dialog.locator('.archive-calendar')).toHaveAttribute(
    'aria-busy',
    'false'
  );
  const puzzleRequests = requests.filter(
    (request) => request.path === '/api/puzzle'
  ).length;
  await dialog.locator('[data-difficulty="medium"].difficulty-option').click();
  await expect(dialog.locator('.archive-calendar')).toHaveAttribute(
    'aria-busy',
    'false'
  );
  await expect(dialog.locator('.archive-month')).toHaveText('October 2026');
  assert.deepEqual(requests.at(-1), {
    path: '/api/archive',
    date: postDate,
    difficulty: 'medium',
    month: '2026-10',
  });
  assert.equal(
    await page.evaluate(() => localStorage.getItem('outnumber-difficulty')),
    'hard'
  );
  await noAggregate(page);
  await page.screenshot({ path: `${output}/archive-filter-mobile.png` });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await ready(page, 'hard', 0);
  assert.equal(
    requests.filter((request) => request.path === '/api/puzzle').length,
    puzzleRequests
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem('outnumber-difficulty')),
    'hard'
  );
  checks.push(
    'Archive filter retains month; cancel leaves game and preference unchanged'
  );
  await page
    .getByRole('button', { name: 'Puzzle archive', exact: true })
    .click();
  await expect(dialog.locator('input[value="hard"]')).toBeChecked();
  await dialog.locator('[data-difficulty="medium"].difficulty-option').click();
  await expect(dialog.locator('.archive-calendar')).toHaveAttribute(
    'aria-busy',
    'false'
  );
  await expect(
    dialog.getByRole('button', { name: 'Unfinished', exact: true })
  ).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: 'All', exact: true })
  ).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: /November 21, 2026, Medium, Completed/ })
  ).toBeEnabled();
  await dialog.getByRole('button', { name: 'Today', exact: true }).click();
  await ready(page, 'medium', 0);
  assert.equal(
    await page.evaluate(() => localStorage.getItem('outnumber-difficulty')),
    'medium'
  );
  checks.push(
    'Archive keeps completed puzzles available without status filters; Today opens and remembers archive difficulty'
  );

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const signatures = new Set<string>();
  for (const group of [
    {
      mode: 'Light',
      theme: 'paper',
      label: 'Light theme',
      palettes: lightThemes,
    },
    {
      mode: 'Dark',
      theme: 'midnight',
      label: 'Dark theme',
      palettes: darkThemes,
    },
  ]) {
    await dialog.getByRole('radio', { name: group.mode, exact: true }).check();
    for (const palette of group.palettes) {
      await dialog
        .getByRole('combobox', { name: group.label, exact: true })
        .selectOption(palette.value);
      await expect(page.locator('html')).toHaveAttribute(
        'data-palette',
        palette.value
      );
      await expect(page.locator('html')).toHaveAttribute(
        'data-theme',
        group.theme
      );
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await openLevel(page);
      await selector(page).evaluate(async (element) => {
        await Promise.all(
          element
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished.catch(() => {}))
        );
      });
      const colors = await selector(page)
        .locator('.difficulty-content')
        .evaluateAll((elements) => {
          const helpers = {
            luminance(color: string) {
              const channels = color.match(/[\d.]+/g)?.map(Number);
              if (!channels || channels.length !== 3)
                throw new Error(`Expected opaque RGB: ${color}`);
              const linear = channels.map((channel) =>
                channel / 255 <= 0.04045
                  ? channel / 255 / 12.92
                  : ((channel / 255 + 0.055) / 1.055) ** 2.4
              );
              return (
                linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722
              );
            },
          };
          return elements.map((element) => {
            const style = getComputedStyle(element);
            const difficulty = element.parentElement?.dataset.difficulty;
            const probe = document.createElement('span');
            probe.style.color = `var(--color-difficulty-${difficulty})`;
            document.body.append(probe);
            const tokenColor = getComputedStyle(probe).color;
            probe.remove();
            const ink = helpers.luminance(style.color);
            const surface = helpers.luminance(style.backgroundColor);
            return {
              difficulty,
              color: style.color,
              tokenColor,
              border: style.borderTopColor,
              contrast:
                (Math.max(ink, surface) + 0.05) /
                (Math.min(ink, surface) + 0.05),
            };
          });
        });
      assert.equal(colors.length, 3);
      for (const color of colors) {
        assert.equal(color.color, color.tokenColor);
        assert.equal(color.border, color.tokenColor);
        assert(
          color.contrast >= 4.5,
          `${group.theme}/${palette.value}/${color.difficulty}: contrast ${color.contrast}`
        );
      }
      signatures.add(JSON.stringify(colors.map((color) => color.color)));
      paletteResults.push({
        theme: group.theme,
        palette: palette.value,
        colors,
      });
      await page.screenshot({
        path: `${output}/level-${group.theme}-${palette.value}.png`,
      });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
    }
  }
  assert(signatures.size > 3, 'Difficulty colors change with the live palette');
  await page.keyboard.press('Escape');
  await noAggregate(page);
  checks.push(
    'All 13 palette variants render semantic difficulty tokens at >=4.5 text and border contrast; live colors change'
  );
  await page.close();

  const { bundle } = loadSeason();
  const certificates = bundle.certificates;
  const challengeEntryData = (
    Object.keys(bundle.pools) as (keyof typeof bundle.pools)[]
  ).flatMap((tier) =>
    bundle.pools[tier].map((id) => ({ tier, raw: bundle.levels[id]! }))
  );
  assert(
    challengeEntryData.every(
      (entry) => entry.raw.width <= 7 && entry.raw.terrain.length <= 7
    ),
    'All season boards fit the 7x7 maximum'
  );
  for (const difficulty of DIFFICULTIES) {
    const entry = challengeEntryData
      .filter((entry) => entry.tier === DIFFICULTY_TIERS[difficulty])
      .sort(
        (first, second) =>
          second.raw.width * second.raw.terrain.length -
          first.raw.width * first.raw.terrain.length
      )[0];
    assert(entry);
    const certificate = certificates[entry.raw.id];
    assert(certificate);
    const shippedLevel = compileLevel(entry.raw);
    for (const viewport of [
      { width: 320, height: 596 },
      { width: 375, height: 596 },
      { width: 1280, height: 800 },
    ]) {
      for (const locale of ['en', 'ja', 'zh-Hans', 'zh-Hant']) {
        const shipped = await browser.newPage({
          viewport,
          colorScheme: 'light',
        });
        await prepare(shipped);
        await shipped.addInitScript(
          (preference) => {
            localStorage.setItem('outnumber-difficulty', preference.difficulty);
            localStorage.setItem('outnumber-language', preference.locale);
          },
          { difficulty, locale }
        );
        await shipped.route('**/api/**', async (route) => {
          const url = new URL(route.request().url());
          if (url.pathname === '/api/puzzle') {
            assert.equal(url.searchParams.get('difficulty'), difficulty);
            return route.fulfill({
              json: {
                type: 'puzzle',
                date: postDate,
                postDate,
                difficulty,
                progress: {
                  easy: { completed: false, started: false, bestSteps: null },
                  medium: { completed: false, started: false, bestSteps: null },
                  hard: { completed: false, started: false, bestSteps: null },
                },
                level: entry.raw,
                state: toWireState(createSession(shippedLevel).present),
                actions: 0,
                steps: 0,
                completed: false,
                bestSteps: null,
                parSteps: certificate.minimumSteps,
                parActions: certificate.minimumActions,
                avatarUrl: null,
                hintSolution: certificate.stepOptimalSolution,
              },
            });
          }
          throw new Error(
            `Unexpected season-board API request: ${url.pathname}`
          );
        });
        await shipped.goto(`${baseUrl}/game.html`);
        await expect(shipped.locator('html')).toHaveAttribute('lang', locale);
        const board = shipped.locator('.board-wrap [role="group"]');
        await expect(board).toBeVisible();
        await expect(shipped.getByRole('dialog')).toHaveCount(0);
        await expect(
          shipped.locator('.game-toolbar button').last()
        ).toBeEnabled();
        await expect
          .poll(() =>
            shipped.evaluate(() => localStorage.getItem('outnumber-difficulty'))
          )
          .toBe(difficulty);
        const controls = await shipped.locator('.game-toolbar button').all();
        assert(controls.length >= 3, 'Gameplay controls are present');
        for (const control of [board, ...controls]) {
          const bounds = await control.boundingBox();
          assert(
            bounds &&
              bounds.width > 0 &&
              bounds.height > 0 &&
              bounds.x >= -1 &&
              bounds.y >= -1 &&
              bounds.x + bounds.width <= viewport.width + 1 &&
              bounds.y + bounds.height <= viewport.height + 1,
            `${difficulty} ${locale} ${viewport.width}: board and controls fit viewport`
          );
        }
        const boardBounds = await board.boundingBox();
        const toolbarBounds = await shipped
          .locator('.game-toolbar')
          .boundingBox();
        assert(
          boardBounds &&
            toolbarBounds &&
            boardBounds.y + boardBounds.height <= toolbarBounds.y + 1,
          'Toolbar does not overlap board'
        );
        assert(
          await shipped.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          'No horizontal overflow'
        );
        await noAggregate(shipped);
        const artifact = `${output}/shipped-${difficulty}-${locale}-${viewport.width}.png`;
        await shipped.screenshot({ path: artifact });
        await openLevel(shipped, locale);
        await expect(
          selector(shipped).locator(`input[value="${difficulty}"]`)
        ).toBeChecked();
        const titleColor = await shipped
          .locator('.daily-header-title')
          .evaluate((element) => getComputedStyle(element).color);
        const levelColor = await selector(shipped)
          .locator(`[data-difficulty="${difficulty}"] .difficulty-content`)
          .evaluate((element) => getComputedStyle(element).color);
        assert.equal(
          titleColor,
          levelColor,
          'Puzzle title uses the selected difficulty color'
        );
        const dialogBounds = await shipped.getByRole('dialog').boundingBox();
        const selectorBounds = await selector(shipped).boundingBox();
        assert(
          dialogBounds &&
            selectorBounds &&
            dialogBounds.x >= -1 &&
            dialogBounds.y >= -1 &&
            dialogBounds.x + dialogBounds.width <= viewport.width + 1 &&
            dialogBounds.y + dialogBounds.height <= viewport.height + 1 &&
            selectorBounds.x >= dialogBounds.x &&
            selectorBounds.y >= dialogBounds.y &&
            selectorBounds.x + selectorBounds.width <=
              dialogBounds.x + dialogBounds.width + 1 &&
            selectorBounds.y + selectorBounds.height <=
              dialogBounds.y + dialogBounds.height + 1,
          `${difficulty} ${locale} ${viewport.width}: Level dialog and selector fit viewport`
        );
        assert(
          await selector(shipped)
            .locator('.difficulty-content')
            .evaluateAll((elements) =>
              elements.every(
                (element) =>
                  element.scrollWidth <= element.clientWidth &&
                  element.scrollHeight <= element.clientHeight
              )
            ),
          'Difficulty labels do not overflow'
        );
        assert(
          await shipped.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          'No horizontal overflow'
        );
        await noAggregate(shipped);
        const levelArtifact = `${output}/shipped-${difficulty}-${locale}-${viewport.width}-level.png`;
        await shipped.screenshot({ path: levelArtifact });
        await shipped.keyboard.press('Escape');
        await expect(shipped.getByRole('dialog')).toHaveCount(0);
        layouts.push({
          difficulty,
          locale,
          id: entry.raw.id,
          width: entry.raw.width,
          height: entry.raw.terrain.length,
          viewport,
          artifact,
          levelArtifact,
        });
        await shipped.close();
      }
    }
  }
  checks.push(
    'All shipped boards <=7x7; largest per difficulty fits 320/375/1280 viewports in all four locales with visible controls and no overlap'
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        checks,
        paletteVariants: paletteResults.length,
        layouts,
        output,
      },
      null,
      2
    )
  );
} catch (error) {
  if (activePage && !activePage.isClosed())
    await activePage
      .screenshot({ path: `${output}/failure.png` })
      .catch(() => {});
  errors.push(
    error instanceof Error ? (error.stack ?? error.message) : String(error)
  );
  throw error;
} finally {
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        status: errors.length ? 'failed' : 'passed',
        baseUrl,
        checks,
        errors,
        requests,
        paletteResults,
        layouts,
      },
      null,
      2
    )
  );
  await browser.close();
}
