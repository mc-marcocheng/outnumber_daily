import { expect, it } from 'vitest';
import { sampleSeason as sample } from './sample-season';
import {
  visualAdmissionIndex,
  visualDuplicate,
} from '../tools/visual-topology';

it('matches uncached visual admission before and after adding rows', () => {
  const originals = Object.values(sample.levels).slice(0, 12);
  const rows = originals.slice(0, 3);
  const index = visualAdmissionIndex(rows);
  for (const raw of originals)
    expect(index.accepts(raw)).toBe(!visualDuplicate(rows, raw));
  for (const raw of originals.slice(3, 6)) {
    index.add(raw);
    rows.push(raw);
    for (const candidate of originals)
      expect(index.accepts(candidate)).toBe(!visualDuplicate(rows, candidate));
  }
});
