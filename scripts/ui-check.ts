import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect, type Locator } from 'playwright/test';
import { compileLevel } from '../src/shared/game/level-schema';
import {
  commitInteraction,
  createSession,
  undo,
} from '../src/shared/game/session';
import { replayWithSteps } from '../src/shared/replay';
import { toWireEvent, toWireState } from '../src/shared/wire';
import { guidedPages, lessons } from '../src/client/tutorials/lessons';
import { dailyCopy } from '../src/client/i18n/daily-copy';
import { tutorialCopy } from '../src/client/i18n/tutorial-copy';

declare global {
  var outnumberOscillatorStarts: number;
}

const baseUrl = process.env.UI_BASE_URL ?? 'http://127.0.0.1:4174';
const rawLevel = {
  formatVersion: 1,
  id: 'ui-fixture',
  revision: 1,
  title: 'A Small Advantage',
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
const level = compileLevel(rawLevel);
let session = createSession(level);
let moves = 0;
let failMove = false;
let failPuzzle = true;
let failArchive = true;
let widePuzzle = false;
let holdMove: Promise<void> | null = null;
let completions = 0;
let tutorialAvatar = false;
let releasePuzzle: () => void = () => {};
const puzzleGate = new Promise<void>((resolve) => {
  releasePuzzle = resolve;
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 375, height: 596 },
  colorScheme: 'light',
});
page.setDefaultTimeout(10000);
const errors: string[] = [];
const layoutFailures: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('.shots', { recursive: true });

try {
  await page.addInitScript(() => {
    globalThis.outnumberOscillatorStarts = 0;
    if (typeof AudioContext === 'undefined') return;
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = createOscillator.call(this);
      const start = oscillator.start;
      oscillator.start = (...args: Parameters<OscillatorNode['start']>) => {
        start.apply(oscillator, args);
        globalThis.outnumberOscillatorStarts++;
      };
      return oscillator;
    };
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const snapshot = (currentSession = session) => ({
      state: toWireState(currentSession.present),
      steps: replayWithSteps(level, currentSession.actions).steps,
      actions: currentSession.actions.length,
    });
    if (pathname === '/api/archive') {
      if (failArchive) {
        failArchive = false;
        return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
      }
      const month = url.searchParams.get('month');
      assert.equal(month, '2026-11');
      return route.fulfill({
        json: {
          type: 'archive',
          difficulty: url.searchParams.get('difficulty') ?? 'easy',
          today: '2026-11-14',
          firstDate: '2026-11-11',
          month,
          days: [
            {
              date: '2026-11-11',
              completed: true,
              started: true,
              bestSteps: 4,
            },
            {
              date: '2026-11-12',
              completed: false,
              started: true,
              bestSteps: null,
            },
            {
              date: '2026-11-13',
              completed: false,
              started: false,
              bestSteps: null,
            },
            {
              date: '2026-11-14',
              completed: session.present.phase === 'won',
              started: session.actions.length > 0,
              bestSteps: session.present.phase === 'won' ? 3 : null,
            },
          ],
        },
      });
    }
    if (pathname === '/api/puzzle') {
      await puzzleGate;
      if (failPuzzle) {
        failPuzzle = false;
        return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
      }
      const date = url.searchParams.get('date') ?? '2026-11-14';
      const puzzleSession =
        date === '2026-11-14' ? session : createSession(level);
      return route.fulfill({
        json: {
          type: 'puzzle',
          date,
          postDate: '2026-11-14',
          difficulty: url.searchParams.get('difficulty') ?? 'easy',
          progress: {
            easy: { completed: false, started: false, bestSteps: null },
            medium: { completed: false, started: false, bestSteps: null },
            hard: { completed: false, started: false, bestSteps: null },
          },
          level: widePuzzle
            ? { ...rawLevel, width: 6, terrain: ['......', '.####.', '......'] }
            : rawLevel,
          parActions: 2,
          parSteps: 3,
          ...snapshot(puzzleSession),
          completed: puzzleSession.present.phase === 'won',
          bestSteps: null,
          avatarUrl: null,
          hintSolution: ['add', 'boss'],
        },
      });
    }
    if (pathname === '/api/move') {
      moves++;
      if (failMove) {
        failMove = false;
        return route.fulfill({
          status: 503,
          json: { message: 'Save unavailable' },
        });
      }
      if (holdMove) await holdMove;
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
          event: toWireEvent(outcome.result.event),
          path: outcome.result.path,
          completed: session.present.phase === 'won',
        },
      });
    }
    if (pathname === '/api/undo') {
      session = undo(session);
      return route.fulfill({ json: { type: 'undo', ...snapshot() } });
    }
    if (pathname === '/api/restart') {
      session = createSession(level);
      return route.fulfill({ json: { type: 'restart', ...snapshot() } });
    }
    if (pathname === '/api/complete') {
      completions++;
      return route.fulfill({
        json: {
          type: 'complete',
          endCard: {
            ...snapshot(),
            parSteps: 3,
            parActions: 2,
            bestSteps: 3,
            rank: 1,
            streak: 7,
            flairMilestone: null,
          },
        },
      });
    }
    if (pathname === '/api/leaderboard')
      return route.fulfill({
        json: { type: 'leaderboard', date: '2026-11-14', rows: [] },
      });
    if (pathname === '/api/init')
      return route.fulfill({
        json: {
          type: 'init',
          date: '2026-11-14',
          avatarUrl: tutorialAvatar
            ? '/test-avatar.png'
            : '/missing-avatar.png',
          streak: 7,
          today: {
            title: level.title,
            parSteps: 3,
            parActions: 2,
            completed: false,
            bestSteps: null,
          },
        },
      });
    throw new Error(`Unexpected API request: ${pathname}`);
  });
  const settled = async () => {
    await expect(page.locator('.player-overlay')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Tutorials', exact: true })
    ).toBeEnabled();
  };
  const screenshot = async (name: string) => {
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth
      ),
      false,
      `${name}: horizontal overflow`
    );
    await page.screenshot({ path: `.shots/${name}.png` });
  };
  const circularIcon = async (button: Locator) => {
    await button.hover();
    for (const side of ['top', 'right', 'bottom', 'left']) {
      await expect(button).toHaveCSS(`border-${side}-width`, '0px');
    }
    await expect(button).toHaveCSS('border-radius', '50%');
    const bounds = await button.boundingBox();
    assert(
      bounds && Math.abs(bounds.width - bounds.height) < 1,
      'Icon buttons must be circular'
    );
  };
  const compactToolbar = async (buttons: Locator) => {
    assert((await buttons.count()) > 0, 'Toolbar must contain buttons');
    for (const button of await buttons.all()) {
      await expect(button).toHaveCSS('flex-direction', 'row');
      const bounds = await button.boundingBox();
      assert(
        bounds && bounds.height <= 48,
        'Toolbar buttons must be at most 48px high'
      );
    }
  };
  const formattedDate = (
    date: string,
    dateStyle: 'medium' | 'full' = 'medium'
  ) =>
    page.evaluate(
      ({ date, dateStyle }) =>
        new Date(`${date}T00:00:00Z`).toLocaleDateString(
          document.documentElement.lang,
          { dateStyle, timeZone: 'UTC' }
        ),
      { date, dateStyle }
    );
  const dailyCountdown = async (date: string) => {
    const today = await page.evaluate(() =>
      new Date(Date.now()).toISOString().slice(0, 10)
    );
    await expect(page.locator('.daily-header-date')).toHaveText(
      await formattedDate(date)
    );
    await expect(page.locator('.daily-header .puzzle-countdown')).toHaveCount(
      date === today ? 1 : 0
    );
  };
  const inlineSteps = async (steps: number) => {
    await expect(page.locator('.daily-steps')).toHaveCount(0);
    await expect
      .poll(() => replayWithSteps(level, session.actions).steps)
      .toBe(steps);
  };
  await page.goto(`${baseUrl}/game.html`);
  await expect(page.locator('.puzzle-loading-board')).toBeVisible();
  const loader = await page.locator('.puzzle-loading-board').boundingBox();
  assert(loader);
  assert(Math.abs(loader.x + loader.width / 2 - 375 / 2) < 2);
  assert(Math.abs(loader.y + loader.height / 2 - 596 / 2) < 40);
  await screenshot('ui-loading-mobile');
  releasePuzzle();
  await expect(
    page.getByRole('button', { name: 'Retry', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await inlineSteps(0);
  await dailyCountdown('2026-11-14');
  await page
    .getByRole('button', { name: 'Puzzle archive', exact: true })
    .click();
  const archiveDialog = page.getByRole('dialog');
  await expect(archiveDialog.getByRole('alert')).toHaveText(
    'Could not load the archive.'
  );
  await archiveDialog
    .getByRole('button', { name: 'Retry', exact: true })
    .click();
  await expect(
    archiveDialog.getByRole('heading', { name: 'November 2026', exact: true })
  ).toBeVisible();
  await expect(archiveDialog.locator('.archive-calendar')).toHaveAttribute(
    'aria-busy',
    'false'
  );
  await expect(
    archiveDialog.getByRole('button', { name: 'Previous month', exact: true })
  ).toBeDisabled();
  await expect(
    archiveDialog.getByRole('button', { name: 'Next month', exact: true })
  ).toBeDisabled();
  const completedDate = await formattedDate('2026-11-11', 'full');
  const completedDay = archiveDialog.getByRole('button', {
    name: `${completedDate}, Easy, Completed, Best 4 steps`,
    exact: true,
  });
  await expect(completedDay).toBeEnabled();
  await expect(
    archiveDialog.getByRole('button', {
      name: `${await formattedDate('2026-11-13', 'full')}, Easy`,
      exact: true,
    })
  ).toBeEnabled();
  await expect(
    archiveDialog.getByRole('button', {
      name: `${await formattedDate('2026-11-14', 'full')}, Easy`,
      exact: true,
    })
  ).toHaveAttribute('aria-current', 'date');
  await screenshot('ui-archive-mobile');
  await archiveDialog
    .locator('.difficulty-option[data-difficulty="medium"]')
    .click();
  await expect(
    archiveDialog.getByRole('radio', { name: 'Medium', exact: true })
  ).toBeChecked();
  await expect(
    archiveDialog.getByRole('button', {
      name: `${completedDate}, Medium, Completed, Best 4 steps`,
      exact: true,
    })
  ).toBeEnabled();
  await archiveDialog
    .locator('.difficulty-option[data-difficulty="easy"]')
    .click();
  await expect(completedDay).toBeEnabled();
  await archiveDialog
    .getByRole('button', {
      name: `${await formattedDate('2026-11-12', 'full')}, Easy, In progress`,
      exact: true,
    })
    .click();
  await expect(page.locator('.daily-header-date')).toHaveText(
    await formattedDate('2026-11-12')
  );
  await dailyCountdown('2026-11-12');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Puzzle archive', exact: true })
    .click();
  await archiveDialog
    .getByRole('button', { name: 'Today', exact: true })
    .click();
  await expect(page.locator('.daily-header-date')).toHaveText(
    await formattedDate('2026-11-14')
  );
  await inlineSteps(0);
  await dailyCountdown('2026-11-14');
  assert.equal(session.actions.length, 0);
  assert.equal(moves, 0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settingsDialog = page.getByRole('dialog');
  const soundSlider = settingsDialog.getByRole('slider', {
    name: 'Sound effects',
    exact: true,
  });
  await expect(soundSlider).toHaveValue('0');
  assert.equal(
    await page.evaluate(() => localStorage.getItem('outnumber-volume')),
    null
  );
  assert.equal(await page.evaluate(() => typeof AudioContext), 'function');
  assert.equal(
    await page.evaluate(() => globalThis.outnumberOscillatorStarts),
    0
  );
  await soundSlider.focus();
  await page.keyboard.down('End');
  await expect(soundSlider).toHaveValue('100');
  assert.equal(
    await page.evaluate(() => globalThis.outnumberOscillatorStarts),
    0,
    'Changing volume must not preview before keyup'
  );
  await page.keyboard.up('End');
  await expect
    .poll(() => page.evaluate(() => globalThis.outnumberOscillatorStarts))
    .toBeGreaterThan(0);
  await page.reload();
  await expect(settingsDialog).toBeVisible();
  await expect(soundSlider).toHaveValue('100');
  assert.equal(
    await page.evaluate(() => globalThis.outnumberOscillatorStarts),
    0
  );
  await soundSlider.dispatchEvent('pointerdown');
  await soundSlider.fill('65');
  await expect(soundSlider).toHaveValue('65');
  assert.equal(
    await page.evaluate(() => localStorage.getItem('outnumber-volume')),
    '65'
  );
  assert.equal(
    await page.evaluate(() => globalThis.outnumberOscillatorStarts),
    0,
    'Changing volume must not preview before pointerup'
  );
  await soundSlider.dispatchEvent('pointerup');
  await expect
    .poll(() => page.evaluate(() => globalThis.outnumberOscillatorStarts))
    .toBeGreaterThan(0);
  await page.reload();
  await expect(settingsDialog).toBeVisible();
  await expect(soundSlider).toHaveValue('65');
  await expect(soundSlider).toHaveAttribute('aria-valuetext', '65%');
  assert.equal(
    await page.evaluate(() => localStorage.getItem('outnumber-volume')),
    '65'
  );
  assert.equal(
    await page.evaluate(() => globalThis.outnumberOscillatorStarts),
    0
  );
  for (const width of [320, 375, 800]) {
    await page.setViewportSize({ width, height: 596 });
    const volumeControls = settingsDialog.locator('.game-settings__volume');
    await expect(volumeControls.locator('output')).toHaveText('65%');
    const bounds = await volumeControls.boundingBox();
    const dialogBounds = await settingsDialog.boundingBox();
    assert(bounds && dialogBounds);
    assert(
      bounds.x >= dialogBounds.x &&
        bounds.x + bounds.width <= dialogBounds.x + dialogBounds.width + 1,
      `Audio controls must fit the settings dialog at ${width}px`
    );
    let previousRight = bounds.x;
    for (const control of [
      volumeControls.getByRole('button', { name: 'Mute sound', exact: true }),
      soundSlider,
      volumeControls.locator('output'),
    ]) {
      await expect(control).toBeVisible();
      const controlBounds = await control.boundingBox();
      assert(controlBounds);
      assert(
        controlBounds.x >= previousRight - 1,
        `Audio controls must not overlap at ${width}px`
      );
      assert(
        controlBounds.x >= bounds.x - 1 &&
          controlBounds.y >= bounds.y - 1 &&
          controlBounds.x + controlBounds.width <=
            bounds.x + bounds.width + 1 &&
          controlBounds.y + controlBounds.height <=
            bounds.y + bounds.height + 1,
        `Audio slider, icon and output must fit their container at ${width}px`
      );
      assert(
        controlBounds.x >= 0 &&
          controlBounds.x + controlBounds.width <= width + 1,
        `Audio controls must fit the viewport at ${width}px`
      );
      previousRight = controlBounds.x + controlBounds.width;
    }
  }
  await page.setViewportSize({ width: 375, height: 596 });
  await settingsDialog
    .getByRole('button', { name: 'Mute sound', exact: true })
    .click();
  await expect(soundSlider).toHaveValue('0');
  assert.equal(
    await page.evaluate(() => localStorage.getItem('outnumber-volume')),
    '0'
  );
  assert.equal(
    await page.evaluate(() => globalThis.outnumberOscillatorStarts),
    0
  );
  await settingsDialog
    .getByRole('button', { name: 'Unmute sound', exact: true })
    .click();
  await expect(soundSlider).toHaveValue('65');
  assert.equal(
    await page.evaluate(() => localStorage.getItem('outnumber-volume')),
    '65'
  );
  await expect
    .poll(() => page.evaluate(() => globalThis.outnumberOscillatorStarts))
    .toBeGreaterThan(0);
  await settingsDialog
    .getByRole('button', { name: 'Mute sound', exact: true })
    .click();
  await expect(soundSlider).toHaveValue('0');
  assert.equal(
    await page.evaluate(() => localStorage.getItem('outnumber-volume')),
    '0'
  );
  await page.reload();
  await expect(settingsDialog).toBeVisible();
  await expect(soundSlider).toHaveValue('0');
  assert.equal(
    await page.evaluate(() => localStorage.getItem('outnumber-volume')),
    '0'
  );
  const checkPalette = async (
    label: string,
    value: string,
    background: string
  ) => {
    await expect(
      settingsDialog.getByRole('combobox', { name: label, exact: true })
    ).toHaveValue(value);
    await expect(page.locator('html')).toHaveAttribute('data-palette', value);
    const colors = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-ink)';
      probe.style.backgroundColor = 'var(--color-surface)';
      document.body.append(probe);
      const surface = getComputedStyle(probe).backgroundColor;
      const ink = getComputedStyle(probe).color;
      const backgroundProbe = document.createElement('span');
      backgroundProbe.style.backgroundColor = 'var(--color-bg)';
      document.body.append(backgroundProbe);
      const background = getComputedStyle(backgroundProbe).backgroundColor;
      backgroundProbe.remove();
      probe.remove();
      const helpers = {
        luminance(color: string) {
          const channels = color.match(/[\d.]+/g)?.map(Number);
          if (!channels || channels.length !== 3)
            throw new Error(`Expected opaque RGB: ${color}`);
          const linear = channels.map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045
              ? normalized / 12.92
              : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return (
            linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722
          );
        },
      };
      const inkLuminance = helpers.luminance(ink);
      const surfaceLuminance = helpers.luminance(surface);
      return {
        token: root.getPropertyValue('--color-bg').trim().toLowerCase(),
        background,
        contrast:
          (Math.max(inkLuminance, surfaceLuminance) + 0.05) /
          (Math.min(inkLuminance, surfaceLuminance) + 0.05),
      };
    });
    const normalizedToken = /^#[\da-f]{3}$/.test(colors.token)
      ? `#${colors.token
          .slice(1)
          .split('')
          .map((digit) => digit + digit)
          .join('')}`
      : colors.token;
    assert.equal(
      normalizedToken,
      background,
      `${label}: ${value} background token`
    );
    const channels = background
      .slice(1)
      .match(/.{2}/g)
      ?.map((channel) => Number.parseInt(channel, 16));
    assert(channels);
    assert.equal(
      colors.background,
      `rgb(${channels.join(', ')})`,
      `${label}: ${value} rendered background`
    );
    assert(
      colors.contrast >= 4.5,
      `${label}: ${value} ink/surface contrast ${colors.contrast} must be >= 4.5`
    );
  };
  const paletteGroups = [
    {
      mode: 'Light',
      label: 'Light theme',
      theme: 'paper',
      palettes: [
        ['classic', '#f5f7f8'],
        ['github-light', '#f6f8fa'],
        ['solarized-light', '#fdf6e3'],
        ['rose-pine-dawn', '#faf4ed'],
        ['catppuccin-latte', '#eff1f5'],
        ['high-contrast-light', '#ffffff'],
      ],
    },
    {
      mode: 'Dark',
      label: 'Dark theme',
      theme: 'midnight',
      palettes: [
        ['classic', '#10151d'],
        ['github-dark', '#0d1117'],
        ['dracula', '#282a36'],
        ['nord', '#2e3440'],
        ['tokyo-night', '#1a1b26'],
        ['catppuccin-mocha', '#1e1e2e'],
        ['high-contrast-dark', '#000000'],
      ],
    },
  ];
  for (const group of paletteGroups) {
    await settingsDialog
      .getByRole('radio', { name: group.mode, exact: true })
      .check();
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      group.theme
    );
    const dropdown = settingsDialog.getByRole('combobox', {
      name: group.label,
      exact: true,
    });
    assert.deepEqual(
      await dropdown
        .locator('option')
        .evaluateAll((options) =>
          options.map((option) => option.getAttribute('value'))
        ),
      group.palettes.map(([value]) => value)
    );
    for (const [value, background] of group.palettes) {
      assert(value && background);
      await dropdown.selectOption(value);
      await checkPalette(group.label, value, background);
    }
  }
  await settingsDialog
    .getByRole('radio', { name: 'Light', exact: true })
    .check();
  await settingsDialog
    .getByRole('combobox', { name: 'Light theme', exact: true })
    .selectOption('solarized-light');
  await settingsDialog
    .getByRole('radio', { name: 'Dark', exact: true })
    .check();
  await settingsDialog
    .getByRole('combobox', { name: 'Dark theme', exact: true })
    .selectOption('nord');
  await settingsDialog
    .getByRole('radio', { name: 'System', exact: true })
    .check();
  await settingsDialog
    .getByRole('switch', { name: 'Reduce motion', exact: true })
    .check();
  for (const scheme of ['light', 'dark', 'light', 'dark']) {
    assert(scheme === 'light' || scheme === 'dark');
    await page.emulateMedia({ colorScheme: scheme });
    await expect(
      settingsDialog.getByRole('radio', { name: 'System', exact: true })
    ).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      scheme === 'light' ? 'paper' : 'midnight'
    );
    await expect(
      settingsDialog.getByRole('combobox', {
        name: scheme === 'light' ? 'Dark theme' : 'Light theme',
        exact: true,
      })
    ).toHaveCount(0);
    await checkPalette(
      scheme === 'light' ? 'Light theme' : 'Dark theme',
      scheme === 'light' ? 'solarized-light' : 'nord',
      scheme === 'light' ? '#fdf6e3' : '#2e3440'
    );
    await page.setViewportSize({ width: 320, height: 480 });
    const switchAlignment = await settingsDialog
      .getByRole('switch', { name: 'Reduce motion', exact: true })
      .evaluate((element) => {
        const track = getComputedStyle(element, '::before');
        const thumb = getComputedStyle(element, '::after');
        const helpers = {
          center(style: CSSStyleDeclaration) {
            return (
              Number.parseFloat(style.top) +
              Number.parseFloat(style.height) / 2 +
              new DOMMatrixReadOnly(style.transform).m42
            );
          },
        };
        return {
          track: helpers.center(track),
          thumb: helpers.center(thumb),
          center: element.getBoundingClientRect().height / 2,
        };
      });
    assert(
      Math.abs(switchAlignment.track - switchAlignment.center) < 1,
      'Reduce motion track must be vertically centered'
    );
    assert(
      Math.abs(switchAlignment.thumb - switchAlignment.center) < 1,
      'Reduce motion thumb must be vertically centered'
    );
    await screenshot(`ui-settings-${scheme}-320x480`);
  }
  await settingsDialog
    .getByRole('combobox', { name: 'Dark theme', exact: true })
    .selectOption('classic');
  await page.emulateMedia({ colorScheme: 'light' });
  await settingsDialog
    .getByRole('combobox', { name: 'Light theme', exact: true })
    .selectOption('classic');
  await settingsDialog
    .getByRole('radio', { name: 'Dark', exact: true })
    .check();
  await settingsDialog
    .getByRole('switch', { name: 'Reduce motion', exact: true })
    .check();
  await page.reload();
  await expect(settingsDialog).toBeVisible();
  await expect(
    settingsDialog.getByRole('radio', { name: 'Dark', exact: true })
  ).toBeChecked();
  await expect(
    settingsDialog.getByRole('combobox', { name: 'Dark theme', exact: true })
  ).toHaveValue('classic');
  await expect(
    settingsDialog.getByRole('switch', { name: 'Reduce motion', exact: true })
  ).toBeChecked();
  await expect(soundSlider).toHaveValue('0');
  assert.equal(
    await page.evaluate(() => localStorage.getItem('outnumber-volume')),
    '0'
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  for (const viewport of [
    { width: 375, height: 596 },
    { width: 320, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    await circularIcon(
      settingsDialog.getByRole('button', { name: 'Close dialog', exact: true })
    );
    const bounds = await settingsDialog.boundingBox();
    assert(
      bounds &&
        bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= viewport.width + 1 &&
        bounds.y + bounds.height <= viewport.height + 1,
      'Settings dialog must fit the viewport'
    );
    await screenshot(`ui-settings-${viewport.width}x${viewport.height}`);
  }
  await page.setViewportSize({ width: 375, height: 596 });
  await settingsDialog
    .getByRole('combobox', { name: 'Language', exact: true })
    .selectOption('ja');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(
    settingsDialog.getByRole('combobox', { name: '\u8a00\u8a9e', exact: true })
  ).toHaveValue('ja');
  await expect(
    settingsDialog.getByRole('switch', {
      name: '\u52d5\u304d\u3092\u6e1b\u3089\u3059',
      exact: true,
    })
  ).toBeChecked();
  await settingsDialog.locator('.dialog-close').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.locator('.daily-header-tools > button').nth(1).click();
  await expect(
    settingsDialog.getByRole('combobox', { name: '\u8a00\u8a9e', exact: true })
  ).toHaveValue('ja');
  await settingsDialog
    .getByRole('combobox', { name: '\u8a00\u8a9e', exact: true })
    .selectOption('system');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    settingsDialog.getByRole('combobox', { name: 'Language', exact: true })
  ).toHaveValue('system');
  await settingsDialog
    .getByRole('radio', { name: 'System', exact: true })
    .check();
  await settingsDialog
    .getByRole('switch', { name: 'Reduce motion', exact: true })
    .uncheck();
  await settingsDialog
    .getByRole('button', { name: 'Close dialog', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 },
    { width: 844, height: 540 },
    { width: 375, height: 480 },
    { width: 320, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(async () => {
        const board = await page.locator('.board').boundingBox();
        return board
          ? Math.abs(board.x + board.width / 2 - viewport.width / 2)
          : Infinity;
      })
      .toBeLessThan(2);
    const controls = await page.locator('.game-toolbar').boundingBox();
    assert(
      controls &&
        controls.x >= 0 &&
        controls.y >= 0 &&
        controls.x + controls.width <= viewport.width + 1 &&
        controls.y + controls.height <= viewport.height + 1
    );
    const expand = await page.locator('.daily-expand').boundingBox();
    assert(
      expand &&
        expand.x >= 0 &&
        expand.y >= 0 &&
        expand.x + expand.width <= viewport.width + 1 &&
        expand.y + expand.height <= viewport.height + 1
    );
    const header = await page.locator('.daily-header').boundingBox();
    const settings = await page
      .locator('.daily-header')
      .getByRole('button', { name: 'Settings', exact: true })
      .boundingBox();
    assert(
      header &&
        settings &&
        expand.x >= settings.x + settings.width - 1 &&
        expand.y >= header.y &&
        expand.y + expand.height <= header.y + header.height + 1,
      'Expand must sit to the right of Settings inside the header'
    );
    await inlineSteps(0);
    await compactToolbar(page.locator('.game-toolbar .toolbar-button'));
    if (viewport.width >= 768) {
      await page.locator('.tile--add').hover();
      await expect(page.locator('.cell--path').first()).toBeVisible();
      await inlineSteps(0);
      assert.equal(moves, 0, 'Hover previews must not submit moves');
      assert.equal(
        session.actions.length,
        0,
        'Hover previews must not change the session'
      );
      await page.locator('.daily-header-title').hover();
      await expect(page.locator('.cell--path')).toHaveCount(0);
    }
    await expect(page.locator('.daily-game')).toHaveCSS(
      'height',
      `${viewport.height}px`
    );
    const cell = await page.locator('.board > :first-child').boundingBox();
    assert(
      cell &&
        cell.width > 0 &&
        cell.width <= 112 &&
        Math.abs(cell.width - cell.height) < 1,
      'Board cells must be square and capped at 112px'
    );
    if (viewport.width >= 1280)
      await expect(page.locator('.board > :first-child')).toHaveCSS(
        'width',
        '112px'
      );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollHeight > innerHeight
      ),
      false,
      `Daily screen vertical overflow at ${viewport.width}x${viewport.height}`
    );
    await screenshot(`ui-daily-${viewport.width}x${viewport.height}`);
  }
  await page.setViewportSize({ width: 375, height: 596 });
  const boardElement = await page.locator('.board').elementHandle();
  await page.locator('.tile--boss').click();
  await expect(page.getByRole('status')).toHaveText(
    'Blocked: another object is in the way.'
  );
  assert.equal(moves, 0);
  assert(
    await boardElement?.evaluate((element) => element.isConnected),
    'Blocked clicks must not remount the board'
  );
  failMove = true;
  await page.locator('.tile--add').click();
  await settled();
  await inlineSteps(0);
  let releaseMove: () => void = () => {};
  holdMove = new Promise<void>((resolve) => {
    releaseMove = resolve;
  });
  await page.locator('.tile--add').click();
  await page.waitForFunction(() => {
    const token = document.querySelector('.player-overlay');
    if (!token) return false;
    const left = Number.parseFloat(getComputedStyle(token).left);
    const width = token.getBoundingClientRect().width;
    return left > 1 && left < width - 1;
  });
  assert.equal(
    session.actions.length,
    0,
    'Animation must begin before the save response'
  );
  await expect(page.locator('.status-value').first()).toHaveText('3');
  await expect(page.locator('.player-overlay')).toHaveCount(0);
  await expect(page.locator('.status-value').first()).toHaveText('7');
  await expect(
    page.getByRole('button', { name: 'Undo', exact: true })
  ).toBeDisabled();
  await inlineSteps(0);
  releaseMove();
  holdMove = null;
  await settled();
  await inlineSteps(1);
  await expect(page.getByRole('status')).toBeEmpty();
  await page
    .getByRole('button', { name: 'Move to row 1, column 3', exact: true })
    .click();
  await settled();
  await inlineSteps(2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await inlineSteps(1);
  for (const viewport of [
    { width: 375, height: 596 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    const confirmation = page.getByRole('dialog');
    await expect(confirmation.locator('.confirm-message')).toHaveText(
      'Restart this puzzle?\nYour current run will be cleared.'
    );
    await expect(confirmation.locator('.confirm-message')).toHaveCSS(
      'white-space',
      'pre-line'
    );
    await expect(confirmation.locator('.confirm-actions')).toHaveCSS(
      'border-top-width',
      '0px'
    );
    const confirmBounds = await confirmation
      .getByRole('button', { name: 'Restart', exact: true })
      .boundingBox();
    const cancelBounds = await confirmation
      .getByRole('button', { name: 'Cancel', exact: true })
      .boundingBox();
    assert(
      confirmBounds &&
        cancelBounds &&
        Math.abs(confirmBounds.y - cancelBounds.y) < 1 &&
        cancelBounds.x > confirmBounds.x
    );
    await screenshot(`ui-restart-${viewport.width}x${viewport.height}`);
    await confirmation
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
  }
  await page.setViewportSize({ width: 375, height: 596 });
  await page.getByRole('button', { name: 'Level', exact: true }).click();
  const levelDialog = page.getByRole('dialog', { name: 'Level', exact: true });
  await expect(levelDialog).toBeVisible();
  await expect(
    levelDialog.getByRole('radio', { name: 'Easy In progress', exact: true })
  ).toBeChecked();
  await expect(
    levelDialog.getByRole('radio', { name: 'Medium', exact: true })
  ).toBeEnabled();
  await expect(
    levelDialog.getByRole('radio', { name: 'Hard', exact: true })
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await inlineSteps(1);
  await page.getByRole('button', { name: 'Tutorials', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Tutorials', exact: true })
  ).toBeVisible();
  await expect(page.locator('.tutorial-header .daily-eyebrow')).toHaveText(
    'OUTNUMBER'
  );
  for (const button of await page
    .locator('.tutorial-header .icon-button')
    .all()) {
    await circularIcon(button);
  }
  await expect(page.locator('.tutorial-list-item--guided')).toHaveClass(
    /action-highlight/
  );
  await expect(page.locator('.tutorial-stops > li')).toHaveCount(11);
  await expect(page.locator('.tutorial-road-bed')).toBeVisible();
  const nextTutorial = page.locator('.tutorial-stops [aria-current="step"]');
  await expect(nextTutorial).toHaveAccessibleName(
    'The first run Guided walkthrough'
  );
  await expect(nextTutorial.locator('.tutorial-route-token')).toBeVisible();
  for (const viewport of [
    { width: 320, height: 300 },
    { width: 375, height: 480 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const fits = await page.locator('.tutorial-menu').evaluate((menu) => {
      const route = menu.querySelector('.tutorial-route')!;
      const panel = menu.getBoundingClientRect();
      const map = route.getBoundingClientRect();
      return (
        menu.scrollHeight <= menu.clientHeight + 1 &&
        Math.abs(panel.x + panel.width / 2 - map.x - map.width / 2) < 1 &&
        Math.abs(panel.y + panel.height / 2 - map.y - map.height / 2) < 1 &&
        [...route.querySelectorAll('li > button')].every((stop) => {
          const bounds = stop.getBoundingClientRect();
          return (
            bounds.bottom <=
            stop.parentElement!.getBoundingClientRect().bottom + 1
          );
        })
      );
    });
    assert.ok(
      fits,
      `Tutorial menu must fit at ${viewport.width}x${viewport.height}`
    );
    await expect(page.locator('.tutorial-list-item').last()).toBeInViewport({
      ratio: 1,
    });
  }
  await page.setViewportSize({ width: 375, height: 596 });
  await screenshot('ui-tutorial-route-menu');
  const ruleDialog = page.locator('.tutorial-rule-card');
  const gotIt = ruleDialog.getByRole('button', { name: 'Got it', exact: true });
  await page
    .getByRole('button', { name: 'The first run Guided walkthrough' })
    .click();
  await expect(ruleDialog).toBeVisible();
  await expect(
    ruleDialog.getByRole('heading', { name: 'You', exact: true })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(ruleDialog).toBeVisible();
  const ruleDemo = ruleDialog.locator('.tutorial-rule-demo');
  await expect(ruleDemo.locator('.tile--add')).toHaveCount(0, {
    timeout: 10000,
  });
  await expect(ruleDemo.locator('.tile--add')).toBeVisible({ timeout: 15000 });
  await screenshot('ui-tutorial-rule-card');
  await gotIt.click();
  await expect(ruleDialog).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Next', exact: true })
  ).toBeFocused();
  await expect(
    page.getByRole('heading', { name: 'You', exact: true })
  ).toBeVisible();
  const guidedBoardBounds = await page.locator('.tutorial-board').boundingBox();
  assert(guidedBoardBounds);
  for (let index = 0; index < guidedPages.length - 1; index++) {
    await expect(
      page.getByRole('button', { name: 'Next', exact: true })
    ).toHaveClass(/action-highlight/);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    if (index + 1 !== 8) {
      await expect(ruleDialog.getByRole('heading')).toHaveText(
        guidedPages[index + 1]!.title
      );
      await gotIt.click();
    } else {
      await expect(ruleDialog).toHaveCount(0);
    }
    for (const cell of guidedPages[index + 1]!.focusCells) {
      await expect(
        page.locator(`.board > :nth-child(${cell + 1})`)
      ).toHaveClass(/cell--tutorial-focus/);
      await expect(page.locator(`.board > :nth-child(${cell + 1})`)).toHaveCSS(
        'opacity',
        '1'
      );
    }
    await expect(
      page.getByRole('button', {
        name: index === guidedPages.length - 2 ? 'Practice' : 'Next',
        exact: true,
      })
    ).toBeEnabled();
    await expect
      .poll(
        async () => {
          const bounds = await page.locator('.tutorial-board').boundingBox();
          return bounds
            ? Math.max(
                Math.abs(bounds.y - guidedBoardBounds.y),
                Math.abs(bounds.height - guidedBoardBounds.height)
              )
            : Infinity;
        },
        { message: 'Walkthrough pages must preserve the settled board region' }
      )
      .toBeLessThan(1);
  }
  await expect(
    page.getByRole('heading', { name: 'Outnumber the boss' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Practice', exact: true })
  ).toHaveClass(/action-highlight/);
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Previous', exact: true })
  ).toBeEnabled();
  await expect(
    page.getByRole('heading', { name: 'Build again' })
  ).toBeVisible();
  await screenshot('ui-guided-mobile');
  await page
    .getByRole('button', { name: 'Tutorial menu', exact: true })
    .click();
  await expect(page.locator('.tutorial-list-item--guided')).not.toHaveClass(
    /action-highlight/
  );
  await expect(nextTutorial).toHaveAccessibleName(lessons[0]!.title);
  for (const [index, lesson] of lessons.entries()) {
    const practice = page.getByRole('button', {
      name: lesson.title,
      exact: true,
    });
    await expect(practice.locator('.lesson-tile > span').first()).toHaveText(
      new RegExp(`^[^0-9]*${index + 1}$`)
    );
    await practice.click();
    if (['undo', 'subtract', 'divide'].includes(lesson.id)) {
      await expect(ruleDialog.getByRole('heading')).toHaveText(lesson.title);
      await gotIt.click();
    } else {
      await expect(ruleDialog).toHaveCount(0);
    }
    if (index === 0) {
      for (const viewport of [
        { width: 375, height: 512 },
        { width: 375, height: 596 },
        { width: 320, height: 480 },
        { width: 1280, height: 800 },
        { width: 1920, height: 1080 },
      ]) {
        await page.setViewportSize(viewport);
        await compactToolbar(
          page.locator('.tutorial-controls .toolbar-button')
        );
        await expect
          .poll(async () => {
            const board = await page.locator('.board').boundingBox();
            return board
              ? Math.abs(board.x + board.width / 2 - viewport.width / 2)
              : Infinity;
          })
          .toBeLessThan(2);
        const controls = await page.locator('.tutorial-controls').boundingBox();
        if (!controls || controls.y + controls.height > viewport.height + 1) {
          const failure = `Tutorial controls overflow at ${viewport.width}x${viewport.height}: ${JSON.stringify(controls)}`;
          layoutFailures.push(failure);
          console.error(failure);
        }
        await screenshot(`ui-tutorial-${viewport.width}x${viewport.height}`);
        await page.getByRole('button', { name: 'Route', exact: true }).click();
        await expect(
          page.getByRole('dialog').locator('.player-overlay')
        ).toBeVisible();
        const routeBody = page.getByRole('dialog').locator('.dialog-body');
        assert.ok(
          await routeBody.evaluate(
            (element) => element.scrollHeight <= element.clientHeight + 1
          ),
          `Route must fit without scrolling at ${viewport.width}x${viewport.height}`
        );
        await screenshot(`ui-route-${viewport.width}x${viewport.height}`);
        await page
          .getByRole('button', { name: 'Close dialog', exact: true })
          .click();
      }
      await page.setViewportSize({ width: 375, height: 596 });
    }
    await page.getByRole('button', { name: 'Route', exact: true }).click();
    const routeDialog = page.getByRole('dialog');
    await expect(
      routeDialog.getByRole('heading', { name: 'Route', exact: true })
    ).toBeVisible();
    await expect(routeDialog.locator('.player-overlay')).toBeVisible();
    if (index === 0) {
      await routeDialog
        .getByRole('button', { name: 'Pause', exact: true })
        .click();
      await expect(
        routeDialog.getByRole('button', { name: 'Play', exact: true })
      ).toBeVisible();
      await expect
        .poll(() =>
          routeDialog
            .locator('.tutorial-route-playback')
            .evaluate((element) =>
              element
                .getAnimations({ subtree: true })
                .every(
                  (animation) =>
                    animation.playState === 'paused' ||
                    animation.playState === 'finished'
                )
            )
        )
        .toBe(true);
      // A move that was already committed when Pause was clicked may still
      // settle. Sample a few times: a paused token must come to rest.
      let stationary = false;
      for (let attempt = 0; attempt < 3 && !stationary; attempt += 1) {
        stationary = await routeDialog
          .locator('.player-overlay')
          .evaluate(async (token) => {
            const before = token.getBoundingClientRect();
            await new Promise((resolve) => setTimeout(resolve, 900));
            const after = token.getBoundingClientRect();
            return (
              Math.abs(before.x - after.x) < 1 &&
              Math.abs(before.y - after.y) < 1
            );
          });
      }
      const progress = await routeDialog.getByRole('status').textContent();
      assert(stationary, 'Paused route token must not move');
      await expect(routeDialog.getByRole('status')).toHaveText(progress!);
      await routeDialog
        .getByRole('button', { name: 'Play', exact: true })
        .click();
    }
    if (index === 0) {
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          value: false,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    }
    if (index === 0) await screenshot('ui-tutorial-route-mobile');
    await expect(routeDialog.getByRole('status')).toHaveText('Complete!', {
      timeout: 30000,
    });
    await routeDialog
      .getByRole('button', { name: 'Replay', exact: true })
      .click();
    await expect(routeDialog.locator('.player-overlay')).toBeVisible();
    await routeDialog
      .getByRole('button', { name: 'Close dialog', exact: true })
      .click();
    const practiceScreen = page.locator('.screen').filter({
      has: page.getByRole('button', { name: 'Tutorial menu', exact: true }),
    });
    await expect(practiceScreen).toHaveCount(1);
    await expect(
      practiceScreen.locator('.tutorial-steps, .daily-steps')
    ).toHaveCount(0);
    await expect(practiceScreen.getByText(/^\d+\s*steps$/)).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Undo', exact: true })
    ).toBeDisabled();
    for (const action of lesson.solution) {
      const cell = action.startsWith('walk:')
        ? Number(action.slice(5))
        : lesson.level.tiles.find((tile) => tile.id === action)!.cell;
      await page.locator(`.board > :nth-child(${cell + 1})`).click();
      await expect(
        page.getByRole('button', { name: 'Undo', exact: true })
      ).toBeEnabled();
    }
    await expect(page.getByRole('status')).toHaveText('Complete!');
    await page
      .getByRole('button', { name: 'Tutorial menu', exact: true })
      .click();
    if (index === 0) {
      await page
        .getByRole('button', { name: 'Close tutorials', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Tutorials', exact: true })
        .click();
      await expect(nextTutorial).toHaveAccessibleName(lessons[1]!.title);
      await expect(practice.locator('.tutorial-stop-check')).toBeVisible();
    }
  }
  await page
    .getByRole('button', { name: 'Close tutorials', exact: true })
    .click();
  await inlineSteps(1);
  await screenshot('ui-daily-mobile');
  await page.locator('.tile--boss').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.result-stats')).toContainText('#1');
  await expect(page.locator('.result-score')).toHaveText(/Easy\s*3\s*steps/);
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'Play again', exact: true })
  ).toBeEnabled();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'Leaderboard', exact: true })
  ).toBeEnabled();
  const shareButton = page
    .getByRole('dialog')
    .getByRole('button', { name: 'Share', exact: true });
  await expect(shareButton).toHaveClass(/action-highlight/);
  await expect(shareButton).toBeDisabled();
  const widths = await page
    .locator('.daily-result-actions button')
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().width)
    );
  assert(Math.max(...widths) - Math.min(...widths) < 1);
  await screenshot('ui-result-mobile');
  await page.reload();
  await expect(page.locator('.board-win-mark')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await screenshot('ui-solved-board-mobile');
  await page
    .locator('.game-toolbar')
    .getByRole('button', { name: 'Level', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Level', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.locator('.board-win-mark').focus();
  await expect(
    page.getByRole('button', { name: 'Results', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.result-stats')).toContainText('#1');
  assert.equal(completions, 2);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await screenshot('ui-result-desktop-dark');
  await page.setViewportSize({ width: 375, height: 596 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  tutorialAvatar = true;
  await page.route('**/test-avatar.png', (route) =>
    route.fulfill({
      path: '.shots/ui-result-mobile.png',
      contentType: 'image/png',
    })
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${baseUrl}/tutorial.html`);
  await expect(page.locator('.tutorial-stop-check')).toHaveCount(11);
  await expect(page.locator('.tutorial-route-token')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'The first run Guided walkthrough' })
    .click();
  await expect(page.locator('.tutorial-rule-card')).toHaveCount(0);
  await expect(page.locator('.player-avatar')).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Next', exact: true })
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.player-overlay .player-avatar')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Next', exact: true })
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Tutorial menu', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'A little stronger', exact: true })
    .click();
  await page.locator('.tile--add').click();
  await expect(page.locator('.player-overlay .player-avatar')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Undo', exact: true })
  ).toBeEnabled();
  await screenshot('ui-tutorial-avatar-mobile');
  widePuzzle = true;
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto(`${baseUrl}/game.html`);
  await expect(page.locator('.board > .cell')).toHaveCount(18);
  const wideBounds = await page.locator('.board').boundingBox();
  assert(
    wideBounds && wideBounds.x >= 0 && wideBounds.x + wideBounds.width <= 320
  );
  await screenshot('ui-wide-board-inline');
  await page
    .getByRole('button', { name: 'Puzzle archive', exact: true })
    .click();
  await expect(page.locator('.archive-calendar')).toHaveAttribute(
    'aria-busy',
    'false'
  );
  await screenshot('ui-archive-small-inline');
  await archiveDialog
    .getByRole('button', { name: 'Close dialog', exact: true })
    .click();
  await expect(archiveDialog).toHaveCount(0);
  widePuzzle = false;
  await page.setViewportSize({ width: 375, height: 596 });
  const noRawKeys = async () => {
    await expect(page.locator('body')).not.toContainText(
      /\b(?:ui|tutorial|settings|game|tile|levels)\.[A-Za-z][\w.-]*/
    );
    const labels = await page
      .locator('[aria-label], [title]')
      .evaluateAll((elements) =>
        elements
          .flatMap((element) => [
            element.getAttribute('aria-label'),
            element.getAttribute('title'),
          ])
          .filter(Boolean)
      );
    assert(
      !labels.some((label) =>
        /\b(?:ui|tutorial|settings|game|tile|levels)\.[A-Za-z][\w.-]*/.test(
          label!
        )
      ),
      'Accessible labels must not expose translation keys'
    );
  };
  for (const locale of ['ja', 'zh-Hans', 'zh-Hant'] as const) {
    const daily = dailyCopy[locale];
    const tutorial = tutorialCopy[locale];
    await page.goto(`${baseUrl}/game.html`);
    await page.locator('.daily-header-tools > button').nth(1).click();
    await settingsDialog
      .locator('.game-settings__language')
      .nth(1)
      .selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await noRawKeys();
    await settingsDialog.locator('.dialog-close').click();
    await noRawKeys();
    const localeViewport = page.viewportSize()!;
    for (const width of [320, 375, 800]) {
      await page.setViewportSize({ width, height: localeViewport.height });
      for (const button of await page.locator('.game-toolbar > button').all()) {
        const label = button.locator('span');
        const bounds = await button.boundingBox();
        const textBounds = await label.boundingBox();
        assert.ok(bounds && textBounds);
        assert.ok(
          textBounds.x >= bounds.x &&
            textBounds.x + textBounds.width <= bounds.x + bounds.width + 1,
          `${locale} toolbar label overflows at ${width}px`
        );
        assert.ok(
          textBounds.y >= bounds.y &&
            textBounds.y + textBounds.height <= bounds.y + bounds.height + 1,
          `${locale} toolbar label overflows vertically at ${width}px`
        );
        assert.ok(
          await label.evaluate(
            (element) => element.scrollWidth <= element.clientWidth + 1
          ),
          `${locale} toolbar text overflows at ${width}px`
        );
      }
    }
    await page.setViewportSize(localeViewport);
    await screenshot(`ui-daily-${locale}`);
    await page.locator('.daily-header-tools > button').first().click();
    await expect(
      archiveDialog.getByRole('heading', {
        name: daily['ui.puzzleArchive'],
        exact: true,
      })
    ).toBeVisible();
    await expect(archiveDialog.locator('.archive-calendar')).toHaveAttribute(
      'aria-busy',
      'false'
    );
    const calendarLabels = await page.evaluate(
      (language) => ({
        month: new Intl.DateTimeFormat(language, {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date('2026-11-01T00:00:00Z')),
        weekdays: Array.from({ length: 7 }, (_, index) =>
          new Intl.DateTimeFormat(language, {
            weekday: 'short',
            timeZone: 'UTC',
          }).format(new Date(Date.UTC(2026, 0, 5 + index)))
        ),
      }),
      locale
    );
    await expect(archiveDialog.locator('.archive-month')).toHaveText(
      calendarLabels.month
    );
    await expect(archiveDialog.locator('.archive-weekdays > span')).toHaveText(
      calendarLabels.weekdays
    );
    await noRawKeys();
    await screenshot(`ui-archive-${locale}`);
    await archiveDialog.locator('.dialog-close').click();
    await page.evaluate(() =>
      localStorage.removeItem('outnumber-tutorial-rules-v1')
    );
    await page.locator('.game-toolbar > button').first().click();
    await expect(page.locator('.tutorial-header h1')).toHaveText(
      tutorial['tutorial.title']!
    );
    await expect(page.locator('.tutorial-list-item--guided strong')).toHaveText(
      tutorial['tutorial.guided.title']!
    );
    await noRawKeys();
    await screenshot(`ui-tutorial-menu-${locale}`);
    await page
      .locator('.tutorial-list-item')
      .filter({
        has: page.getByText(tutorial['tutorial.lesson.set.title']!, {
          exact: true,
        }),
      })
      .click();
    const localizedRule = page.locator('.tutorial-rule-card');
    await expect(localizedRule.getByRole('heading')).toHaveText(
      tutorial['tutorial.lesson.set.title']!
    );
    await localizedRule
      .getByRole('button', { name: tutorial['tutorial.gotIt']!, exact: true })
      .click();
    await expect(page.locator('.tutorial-header h1')).toHaveText(
      tutorial['tutorial.lesson.set.title']!
    );
    await expect(page.locator('.board > .cell')).toHaveCount(15);
    for (const cell of [4, 14]) {
      await expect(page.locator('.board > .cell').nth(cell)).toHaveClass(
        /cell--wall/
      );
    }
    await expect(page.locator('.tile--boss')).toHaveClass(/tile--unreachable/);
    await page.locator('.tile--boss').click();
    await expect(page.locator('.board-feedback')).toHaveText(
      tutorial['tutorial.blocked']!
    );
    await noRawKeys();
    await screenshot(`ui-tutorial-set-blocked-${locale}`);
    for (const cell of [6, 8, 9]) {
      await page.locator('.board > .cell').nth(cell).click();
      await expect(
        page.locator('.tutorial-controls > button').first()
      ).toBeEnabled();
      await expect(page.locator('.player-overlay')).toHaveCount(0);
    }
    await expect(page.locator('.board-feedback')).toHaveText(
      tutorial['tutorial.complete']!
    );
    await noRawKeys();
    await screenshot(`ui-tutorial-set-complete-${locale}`);
    await page.locator('.tutorial-header > button').last().click();
    await expect(page.locator('.tutorial-screen')).toHaveCount(0);
    await page.goto(`${baseUrl}/game.html`);
    await page.locator('.daily-header-tools > button').nth(1).click();
    await settingsDialog
      .locator('.game-settings__language')
      .nth(1)
      .selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await settingsDialog.locator('.dialog-close').click();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(layoutFailures, [], 'Implementation layout failures');
  console.log(
    `PASS: inline game with hidden step counter, archive difficulty/date switching, Level dialog, settings, hover previews, daily failure/retry, blocked/walk/undo, walkthrough, ${lessons.length} practices, preserved daily state, restored results, responsive screenshots, avatar fallback, Japanese and Chinese archive/tutorial regressions.`
  );
} finally {
  await browser.close();
}
