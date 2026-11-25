import { describe, expect, it } from 'vitest';
import { buildExactGraph } from '../src/shared/game/analysis-graph';
import { compileLevel } from '../src/shared/game/level-schema';
import {
  mechanicalDuplicate,
  mechanicalSignature,
  provesWinningDependencies,
  roleDistance,
} from '../tools/mechanical-signature';

function signature(scale: number, reverse = false, boss = 10): string {
  const level = compileLevel({
    formatVersion: 1,
    id: 'signature-test',
    revision: 1,
    title: 'Signature test',
    width: 4,
    terrain: ['....'],
    startCell: reverse ? 3 : 0,
    startValue: String(2 * scale),
    spareLives: 0,
    tiles: [
      {
        id: 'add',
        kind: 'add',
        cell: reverse ? 2 : 1,
        amount: String(4 * scale),
      },
      { id: 'multiply', kind: 'multiply', cell: reverse ? 1 : 2, amount: '2' },
      {
        id: 'boss',
        kind: 'boss',
        cell: reverse ? 0 : 3,
        value: String(boss * scale),
      },
    ],
  });
  const result = buildExactGraph(level, {
    maxStates: 1000,
    maxEdges: 10000,
    maxMs: 1000,
  });
  if (result.status !== 'complete') throw new Error('Incomplete test graph');
  return mechanicalSignature(level, result.graph);
}

describe('mechanical identity', () => {
  it('proves prerequisite order across all winning routes rather than one witness', () => {
    const level = compileLevel({
      formatVersion: 1,
      id: 'order-test',
      revision: 1,
      title: 'Order test',
      width: 4,
      terrain: ['....'],
      startCell: 0,
      startValue: '2',
      spareLives: 0,
      tiles: [
        { id: 'add', kind: 'add', cell: 1, amount: '4' },
        { id: 'multiply', kind: 'multiply', cell: 2, amount: '2' },
        { id: 'boss', kind: 'boss', cell: 3, value: '10' },
      ],
    });
    const result = buildExactGraph(level, {
      maxStates: 1000,
      maxEdges: 10000,
      maxMs: 1000,
    });
    if (result.status !== 'complete')
      throw new Error('Incomplete fixture graph');
    expect(provesWinningDependencies(result.graph, [['add', 'multiply']])).toBe(
      true
    );
    expect(provesWinningDependencies(result.graph, [['multiply', 'add']])).toBe(
      false
    );
    expect(provesWinningDependencies(result.graph, [['add']])).toBe(false);
  });
  it('collapses scaling and reflected geometry', () => {
    expect(signature(1)).toBe(signature(7, true));
  });
  it('detects changed combat consequences', () => {
    expect(signature(1)).not.toBe(signature(1, false, 12));
  });
  it('rejects equal and slightly edited role orders even with different graph hashes', () => {
    const source = {
      mechanical: 'first',
      sequence: 'add,multiply,enemy,boss',
      stepSequence: 'add,multiply,enemy,boss',
    };
    expect(
      mechanicalDuplicate([source], { ...source, mechanical: 'second' })
    ).toBe('near role sequence');
    expect(
      mechanicalDuplicate([source], {
        mechanical: 'second',
        sequence: 'multiply,add,enemy,boss',
        stepSequence: 'multiply,add,enemy,boss',
      })
    ).toBe('near role sequence');
    expect(roleDistance('add,multiply,boss', 'set,enemy,enemy,boss')).toBe(3);
  });
  it('rejects causal equivalence even with different selected witness roles', () => {
    expect(
      mechanicalDuplicate(
        [
          {
            mechanical: 'same',
            sequence: 'add,multiply,boss',
            stepSequence: 'add,multiply,boss',
          },
        ],
        {
          mechanical: 'same',
          sequence: 'set,enemy,enemy,enemy,boss',
          stepSequence: 'set,enemy,enemy,enemy,boss',
        }
      )
    ).toBe('causal graph');
  });
  it('allows sequences separated by at least three edits when causal graphs differ', () => {
    expect(
      mechanicalDuplicate(
        [
          {
            mechanical: 'first',
            sequence: 'add,multiply,boss',
            stepSequence: 'add,multiply,boss',
          },
        ],
        {
          mechanical: 'second',
          sequence: 'set,enemy,enemy,enemy,boss',
          stepSequence: 'set,enemy,enemy,enemy,boss',
        }
      )
    ).toBeUndefined();
  });
});
