import { describe, expect, it } from 'vitest';
import { buildCertificateHints } from '../src/client/hooks/useCertificateHints';
import { lessons } from '../src/client/tutorials/lessons';
import { en } from '../src/client/i18n/en';
import { ja } from '../src/client/i18n/ja';
import { zhHans } from '../src/client/i18n/zh-Hans';
import { zhHant } from '../src/client/i18n/zh-Hant';

describe('bounded certificate hints', () => {
  it('keeps hint placeholders and plain punctuation in every locale', () => {
    const keys = [
      'rule.window',
      'hint.arithmeticOrder',
      'hint.bankPlanning',
      'hint.bossPlanning',
      'hint.reachableTarget',
      'hintAction.absorb',
      'hintAction.bank',
      'hintAction.add',
      'hintAction.multiply',
      'hintAction.set',
      'hintAction.subtract',
      'hintAction.divide',
      'rule.subtract',
      'rule.divide',
    ] satisfies Array<keyof typeof en>;
    for (const locale of [en, ja, zhHans, zhHant]) {
      for (const key of keys) {
        expect(locale[key]).not.toMatch(/[—–]|solver|ソルバー|解题器|解題器/);
        expect(locale[key].match(/\{\{\w+\}\}/g)?.sort() ?? []).toEqual(
          en[key].match(/\{\{\w+\}\}/g)?.sort() ?? []
        );
      }
    }
  });
  it('offers distinct nudges with at most one opening action, not route prefixes', () => {
    const lesson = lessons.find((item) => item.id === 'bank')!;
    const hints = buildCertificateHints(
      lesson.level,
      lesson.solution,
      (key) => key
    );
    expect(hints.hints).toHaveLength(3);
    expect(hints.hints.every((hint) => hint.length === 1)).toBe(true);
    expect(new Set(hints.hints.flat()).size).toBe(3);
    expect(
      hints.hints.flat().filter((text) => text.startsWith('hintAction.'))
    ).toHaveLength(1);
    expect(hints.hints.flat()).not.toContain('hintAction.win');
  });
  it('never reveals a one-action winning solution', () => {
    const lesson = lessons[0]!;
    const hints = buildCertificateHints(lesson.level, ['boss'], (key) => key);
    expect(hints.hints.flat()).not.toContain('hintAction.win');
  });
  it('gets every hint from the locale rather than embedded English', () => {
    for (const lesson of lessons) {
      const hints = buildCertificateHints(
        lesson.level,
        lesson.solution,
        (key) => `translated:${key}`
      );
      expect(
        hints.hints.flat().every((text) => text.startsWith('translated:'))
      ).toBe(true);
    }
  });
});
