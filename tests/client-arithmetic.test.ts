// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameBoard } from '../src/client/components/GameBoard';
import { InteractionPanel } from '../src/client/components/InteractionPanel';
import { formatAnnouncement } from '../src/client/components/game-event-announcement';
import { formatInteractionFailure } from '../src/client/components/interaction-failure';
import { buildCertificateHints } from '../src/client/hooks/useCertificateHints';
import i18n, { i18nReady } from '../src/client/i18n';
import { supportedLocales } from '../src/client/i18n/locales';
import type {
  GameState,
  InteractionEvent,
  Level,
  Tile,
} from '../src/shared/game/model';

const cases = [
  {
    kind: 'subtract',
    symbol: '−',
    amount: 4n,
    before: 11n,
    after: 7n,
    reason: 'non-positive-result',
  },
  {
    kind: 'divide',
    symbol: '÷',
    amount: 2n,
    before: 14n,
    after: 7n,
    reason: 'non-integer-result',
  },
] as const;

describe('client arithmetic presentation', () => {
  for (const locale of supportedLocales) {
    for (const operation of cases) {
      it(`renders ${operation.kind} symbols, labels, previews and failures in ${locale}`, async () => {
        await i18nReady;
        await i18n.changeLanguage(locale);
        const tile: Tile = {
          id: 'operation',
          kind: operation.kind,
          cell: 1,
          amount: operation.amount,
        };
        const level: Level = {
          id: 'client-arithmetic',
          revision: 1,
          title: 'Arithmetic',
          width: 3,
          terrain: ['...'],
          startCell: 0,
          startValue: operation.before,
          spareLives: 0,
          tiles: [tile, { id: 'boss', kind: 'boss', cell: 2, value: 6n }],
        };
        const state: GameState = {
          position: 0,
          value: operation.before,
          spareLives: 0,
          phase: 'playing',
          enemies: new Map([['boss', 6n]]),
          usedOps: new Set(),
        };
        const event: InteractionEvent = {
          kind: operation.kind,
          tileId: tile.id,
          playerBefore: operation.before,
          playerAfter: operation.after,
        };
        const board = document.createElement('div');
        board.innerHTML = renderToStaticMarkup(
          createElement(GameBoard, {
            level,
            state,
            selectedId: null,
            path: null,
            cellSize: 48,
            disabled: false,
            hidePlayer: false,
            flashTileId: null,
            avatarUrl: null,
            onSelect: () => {},
            onClearSelection: () => {},
          })
        );
        const button = board.querySelector(`.tile--${operation.kind}`);
        expect(button?.textContent).toContain(
          `${operation.symbol}${operation.amount}`
        );
        const label = i18n.t(`game.${operation.kind}Label`, {
          value: operation.amount.toString(),
        });
        expect(button?.getAttribute('aria-label')).toContain(label);
        expect(label).not.toBe(`game.${operation.kind}Label`);

        const panel = document.createElement('div');
        panel.innerHTML = renderToStaticMarkup(
          createElement(InteractionPanel, {
            instruction: '',
            disabled: false,
            onConfirm: () => {},
            selection: {
              tile,
              result: { ok: true, state, path: [0, 1], event },
            },
          })
        );
        expect(panel.textContent).toContain(
          i18n.t(`game.${operation.kind}Preview`, {
            before: operation.before.toString(),
            after: operation.after.toString(),
          })
        );
        expect(panel.querySelector('button')?.textContent).toBe(
          i18n.t(
            operation.kind === 'subtract'
              ? 'game.takeSubtract'
              : 'game.takeDivide',
            { value: operation.amount.toString() }
          )
        );

        panel.innerHTML = renderToStaticMarkup(
          createElement(InteractionPanel, {
            instruction: '',
            disabled: false,
            onConfirm: () => {},
            selection: {
              tile,
              result: { ok: false, reason: operation.reason },
            },
          })
        );
        const failure = formatInteractionFailure(i18n.t, operation.reason);
        expect(panel.textContent).toContain(failure);
        expect(panel.querySelector('button')).toBeNull();
        expect(failure).not.toMatch(/^game\./);
        expect(failure).not.toBe(i18n.t('game.blocked'));
        expect(formatAnnouncement(i18n.t, event)).toBe(
          i18n.t(`announce.${operation.kind}`, { value: '7' })
        );

        const keys = [
          `game.${operation.kind}Label`,
          `game.${operation.kind}Preview`,
          operation.kind === 'subtract'
            ? 'game.takeSubtract'
            : 'game.takeDivide',
          operation.kind === 'subtract'
            ? 'game.nonPositiveResult'
            : 'game.nonIntegerResult',
          `hintAction.${operation.kind}`,
          `announce.${operation.kind}`,
          `rule.${operation.kind}`,
        ];
        for (const key of keys) {
          const translated: unknown = i18n.getResource(locale, 'ui', key);
          const english: unknown = i18n.getResource('en', 'ui', key);
          expect(typeof translated, key).toBe('string');
          if (typeof translated !== 'string' || typeof english !== 'string')
            continue;
          expect(translated.trim(), key).not.toBe('');
          expect(translated.match(/{{\w+}}/g)?.sort() ?? [], key).toEqual(
            english.match(/{{\w+}}/g)?.sort() ?? []
          );
          if (locale !== 'en') expect(translated, key).not.toBe(english);
        }
      });
    }
  }

  for (const operation of cases) {
    it(`announces only a valid ${operation.kind} certificate opening`, () => {
      const level: Level = {
        id: 'arithmetic-hint',
        revision: 1,
        title: 'Arithmetic',
        width: 3,
        terrain: ['...'],
        startCell: 0,
        startValue: operation.before,
        spareLives: 0,
        tiles: [
          {
            id: 'operation',
            kind: operation.kind,
            cell: 1,
            amount: operation.amount,
          },
          { id: 'boss', kind: 'boss', cell: 2, value: 6n },
        ],
      };
      expect(
        buildCertificateHints(
          level,
          ['operation', 'boss'],
          (key) => key
        ).hints.flat()
      ).toEqual([
        `rule.${operation.kind}`,
        'hint.bossPlanning',
        `hintAction.${operation.kind}`,
      ]);
      const invalid = {
        ...level,
        startValue: operation.kind === 'subtract' ? 4n : 5n,
      };
      expect(
        buildCertificateHints(
          invalid,
          ['operation', 'boss'],
          (key) => key
        ).hints.flat()
      ).toContain('hint.none');
    });
  }

  it('preserves blocked and generic failure feedback', () => {
    expect(
      formatInteractionFailure((key) => key, 'unreachable', 'tutorial.blocked')
    ).toBe('tutorial.blocked');
    expect(formatInteractionFailure((key) => key, 'inactive-tile')).toBe(
      'game.cannotInteract'
    );
  });
});
