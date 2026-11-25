import { initialState, interact } from '../src/shared/game/engine';
import {
  compileLevel,
  generatedLevelSchema,
  type RawLevel,
} from '../src/shared/game/level-schema';
import { randomSource } from './random';
import { SEASON_BOARD_LIMITS } from './mechanical-pool';

export type Composition = {
  raw: RawLevel;
  witness: string[];
  dependencies: string[][];
};

export type CompactDecisionOptions = {
  tier?: 'advanced' | 'expert' | 'master';
  stages?: number;
  deposits?: 1 | 2;
  programMode?: 'bounded' | 'nonbank-two-stage' | 'nonbank-three-stage';
  layoutMode?: 'varied';
  acceptsLayout?: (raw: RawLevel) => boolean;
  onReject?: (reason: string) => void;
};

type CompactRole = 'add' | 'subtract' | 'multiply' | 'divide' | 'enemy';

function variedDecisionRooms(
  seed: number,
  attempt: number,
  width: number,
  height: number,
  capacities: number[],
  template: { floor: Set<number>; chambers: number[][]; gates: number[] }
) {
  const random = randomSource(
    (Math.imul(seed, 15485863) + attempt * 104729) >>> 0
  );
  const neighbors = (cell: number) =>
    [
      cell - width,
      cell + width,
      ...(cell % width > 0 ? [cell - 1] : []),
      ...(cell % width < width - 1 ? [cell + 1] : []),
    ].filter((next) => next >= 0 && next < width * height);
  if (attempt % 2 === 0) {
    const floor = new Set(template.floor);
    const gates = [...template.gates];
    const chambers = template.chambers.map((chamber) => {
      const room = new Set([chamber[0]!]);
      const queue = [...room];
      for (const cell of queue) {
        for (const next of neighbors(cell)) {
          if (floor.has(next) && !gates.includes(next) && !room.has(next)) {
            room.add(next);
            queue.push(next);
          }
        }
      }
      return room;
    });
    for (const [stage, room] of chambers.entries()) {
      const removalCount = Math.floor(
        random() * (Math.max(0, room.size - capacities[stage]!) + 1)
      );
      for (let index = 0; index < removalCount; index += 1) {
        const removable = [...room].filter((cell) => {
          if (neighbors(cell).some((next) => gates.includes(next)))
            return false;
          const remaining = new Set(room);
          remaining.delete(cell);
          const queue = [[...remaining][0]!];
          const visited = new Set(queue);
          for (const member of queue) {
            for (const next of neighbors(member)) {
              if (remaining.has(next) && !visited.has(next)) {
                visited.add(next);
                queue.push(next);
              }
            }
          }
          return visited.size === remaining.size;
        });
        if (!removable.length) break;
        const cell = removable[Math.floor(random() * removable.length)]!;
        room.delete(cell);
        floor.delete(cell);
      }
      const additions = Math.floor(random() * 4);
      for (let index = 0; index < additions; index += 1) {
        const available = [...new Set([...room].flatMap(neighbors))].filter(
          (cell) =>
            !floor.has(cell) &&
            neighbors(cell).every((next) => !floor.has(next) || room.has(next))
        );
        if (!available.length) break;
        const cell = available[Math.floor(random() * available.length)]!;
        room.add(cell);
        floor.add(cell);
      }
    }
    if (chambers.some((room, stage) => room.size < capacities[stage]!))
      return undefined;
    const rooms = chambers.map((room) => [...room]);
    const startCell = rooms[0]!.splice(
      Math.floor(random() * rooms[0]!.length),
      1
    )[0]!;
    return { floor, chambers: rooms, gates, startCell };
  }
  const floor = new Set<number>();
  const chambers: number[][] = [];
  const gates: number[] = [];
  let first = Math.floor(random() * width * height);
  for (const [stage, capacity] of capacities.entries()) {
    const room = new Set([first]);
    const reserved = capacities
      .slice(stage + 1)
      .reduce((sum, size) => sum + size + 1, 0);
    const extra = Math.min(
      3,
      Math.max(0, width * height - floor.size - capacity - reserved)
    );
    const target = capacity + Math.floor(random() * (extra + 1));
    const previousGate = gates[stage - 1];
    const allowed = (cell: number) =>
      !floor.has(cell) &&
      neighbors(cell).every(
        (next) => !floor.has(next) || next === previousGate
      );
    while (room.size < target) {
      const frontier = [...new Set([...room].flatMap(neighbors))].filter(
        (cell) => !room.has(cell) && allowed(cell)
      );
      if (!frontier.length) return undefined;
      room.add(frontier[Math.floor(random() * frontier.length)]!);
    }
    chambers.push([...room]);
    for (const cell of room) floor.add(cell);
    if (stage === capacities.length - 1) break;
    const connectors = [...new Set([...room].flatMap(neighbors))].filter(
      (cell) =>
        !floor.has(cell) &&
        neighbors(cell).every((next) => !floor.has(next) || room.has(next))
    );
    const exits = connectors.flatMap((gate) =>
      neighbors(gate)
        .filter(
          (cell) =>
            !floor.has(cell) &&
            cell !== gate &&
            neighbors(cell).every((next) => !floor.has(next))
        )
        .map((cell) => ({ gate, cell }))
    );
    if (!exits.length) return undefined;
    const exit = exits[Math.floor(random() * exits.length)]!;
    gates.push(exit.gate);
    floor.add(exit.gate);
    first = exit.cell;
  }
  const startRoom = chambers[0]!;
  const startCell = startRoom.splice(
    Math.floor(random() * startRoom.length),
    1
  )[0]!;
  return { floor, chambers, gates, startCell };
}

function boundedDecisionProgram(
  seed: number,
  stages: number,
  tier: NonNullable<CompactDecisionOptions['tier']>
) {
  const random = randomSource((Math.imul(seed, 7919) + 891791) >>> 0);
  const templates: CompactRole[][] = [
    ['subtract'],
    ['divide'],
    ['enemy'],
    ['add'],
    ['multiply'],
    ['add', 'subtract'],
    ['subtract', 'add'],
    ['multiply', 'subtract'],
    ['divide', 'add'],
    ['add', 'divide'],
    ['enemy', 'subtract'],
    ['subtract', 'multiply'],
    ['subtract', 'divide'],
    ['divide', 'subtract'],
    ['subtract', 'enemy'],
    ['multiply', 'subtract', 'divide'],
    ['divide', 'add', 'enemy'],
    ['enemy', 'subtract', 'divide'],
    ['subtract', 'multiply', 'add'],
    ['add', 'divide', 'subtract'],
    ['subtract', 'enemy', 'divide'],
    ['divide', 'subtract', 'multiply'],
    ['multiply', 'add', 'subtract'],
  ];
  const subtractStage = Math.floor(random() * stages);
  const divideStage =
    (subtractStage + 1 + Math.floor(random() * (stages - 1))) % stages;
  for (let attempt = 0; attempt < 64; attempt += 1) {
    let slots = tier === 'master' ? 6 : stages * 3;
    const selected = Array.from({ length: stages }, (_, stage) => {
      const capacity = Math.min(
        tier === 'advanced' && stage === 0 ? 2 : 3,
        slots - (stages - stage - 1)
      );
      const available = templates.filter(
        (program) =>
          program.length <= capacity &&
          (stage !== subtractStage || program.includes('subtract')) &&
          (stage !== divideStage || program.includes('divide'))
      );
      const program = available[Math.floor(random() * available.length)]!;
      slots -= program.length;
      return program;
    });
    const amounts: bigint[][] = Array.from({ length: stages }, () => []);
    let value = BigInt(
      (tier === 'advanced' ? 24 : 54) + Math.floor(random() * 57)
    );
    let feasible = true;
    for (let stage = stages - 1; stage >= 0; stage -= 1) {
      const program = selected[stage]!;
      const solve = (
        member: number,
        output: bigint
      ): { input: bigint; amounts: bigint[] } | undefined => {
        if (member < 0)
          return output >= 12n &&
            output <= (stage === 0 ? 160n : 199n) &&
            (stage === 0 || output % 2n === 1n)
            ? { input: output, amounts: [] }
            : undefined;
        const kind = program[member]!;
        const choices =
          kind === 'multiply' || kind === 'divide'
            ? [2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n]
            : kind === 'enemy'
              ? Array.from(
                  { length: 8 },
                  (_, index) => (output - 1n) / 2n - BigInt(index)
                )
              : [
                  ...Array.from({ length: 24 }, (_, index) =>
                    BigInt(index + 3)
                  ),
                  ...[2n, 3n, 4n].flatMap((divisor) => [
                    output / divisor,
                    output / divisor + 1n,
                  ]),
                ];
        const offset = Math.floor(random() * choices.length);
        for (let index = 0; index < choices.length; index += 1) {
          const quantity = choices[(index + offset) % choices.length]!;
          if (kind === 'multiply' && output % quantity !== 0n) continue;
          const input =
            kind === 'add'
              ? output - quantity
              : kind === 'subtract'
                ? output + quantity
                : kind === 'multiply'
                  ? output / quantity
                  : kind === 'divide'
                    ? output * quantity
                    : output - quantity;
          const amount = quantity;
          if (
            input < 2n ||
            input > 999n ||
            amount < 1n ||
            amount > 999n ||
            (kind === 'enemy' && input <= amount)
          )
            continue;
          const preceding = solve(member - 1, input);
          if (preceding)
            return {
              input: preceding.input,
              amounts: [...preceding.amounts, amount],
            };
        }
        return undefined;
      };
      const solution = solve(program.length - 1, value);
      if (!solution) {
        feasible = false;
        break;
      }
      const shortcut = (
        input: bigint,
        remaining: number[],
        used: number
      ): boolean => {
        if (used < program.length && input === value) return true;
        for (const member of remaining) {
          const kind = program[member]!;
          const amount = solution.amounts[member]!;
          if (
            (kind === 'divide' && input % amount !== 0n) ||
            (kind === 'enemy' && input <= amount)
          )
            continue;
          const output =
            kind === 'subtract'
              ? input - amount
              : kind === 'divide'
                ? input / amount
                : kind === 'multiply'
                  ? input * amount
                  : input + amount;
          if (
            output > 0n &&
            shortcut(
              output,
              remaining.filter((index) => index !== member),
              used + 1
            )
          )
            return true;
        }
        return false;
      };
      if (
        shortcut(
          solution.input,
          program.map((_, member) => member),
          0
        )
      ) {
        feasible = false;
        break;
      }
      amounts[stage] = solution.amounts;
      value = stage === 0 ? solution.input : (solution.input + 1n) / 2n;
    }
    if (feasible) return { working: value, selected, amounts };
  }
  return undefined;
}

function nonbankStageCandidate(
  seed: number,
  options: CompactDecisionOptions,
  stages: 2 | 3
): Composition | undefined {
  const reject = (reason: string): undefined => {
    options.onReject?.(reason);
    return undefined;
  };
  if (
    !Number.isSafeInteger(seed) ||
    seed < 0 ||
    (options.tier ?? 'advanced') !== 'advanced' ||
    (options.stages ?? stages) !== stages ||
    options.deposits !== undefined
  )
    return reject('nonbank options');
  const synthesis = boundedDecisionProgram(seed, stages, 'expert');
  if (!synthesis) return reject('bounded program');
  const tiles: RawLevel['tiles'] = [
    { id: 'working', cell: 0, kind: 'set', amount: String(synthesis.working) },
  ];
  const witness = ['working'];
  const dependencies: string[][] = [];
  let value = synthesis.working;
  for (const [stage, program] of synthesis.selected.entries()) {
    const windowId = `window-${stage}`;
    for (const [member, kind] of program.entries()) {
      const id = `resource-${stage}-${member}`;
      const amount = synthesis.amounts[stage]![member]!;
      tiles.push(
        kind === 'enemy'
          ? { id, cell: 0, kind, value: String(amount) }
          : { id, cell: 0, kind, amount: String(amount) }
      );
      value =
        kind === 'subtract'
          ? value - amount
          : kind === 'divide'
            ? value / amount
            : kind === 'multiply'
              ? value * amount
              : value + amount;
      if (value < 2n || value > 999n) return reject('resource value range');
      witness.push(id);
      dependencies.push([id, windowId]);
    }
    tiles.push({
      id: windowId,
      cell: 0,
      kind: 'enemy',
      value: String(value - 1n),
      maxSurplus: '1',
    });
    witness.push(windowId);
    value = value * 2n - 1n;
    if (stage > 0) dependencies.push([`window-${stage - 1}`, windowId]);
  }
  const randomFinish = randomSource((Math.imul(seed, 65537) + 32452843) >>> 0);
  const finishCount = stages === 2 ? 1 + Math.floor(randomFinish() * 2) : 1;
  const finishKinds: ('add' | 'multiply' | 'enemy')[] = [
    'add',
    'multiply',
    'enemy',
  ];
  for (let member = 0; member < finishCount; member += 1) {
    const id = member === 0 ? 'finish' : `finish-${member}`;
    const kind =
      stages === 3
        ? 'multiply'
        : finishKinds[Math.floor(randomFinish() * finishKinds.length)]!;
    const amount =
      stages === 3
        ? 2n
        : kind === 'multiply'
          ? 2n + BigInt(Math.floor(randomFinish() * 2))
          : kind === 'enemy'
            ? (value - 1n) / 2n
            : 3n + BigInt(Math.floor(randomFinish() * 24));
    tiles.push(
      kind === 'enemy'
        ? { id, cell: 0, kind, value: String(amount) }
        : { id, cell: 0, kind, amount: String(amount) }
    );
    value = kind === 'multiply' ? value * amount : value + amount;
    if (value > 999n) return reject('finish value range');
    witness.push(id);
    if (stages === 2)
      dependencies.push([`window-${stages - 1}`, id], [id, 'boss']);
  }
  tiles.push({ id: 'boss', cell: 0, kind: 'boss', value: String(value - 1n) });
  witness.push('boss');
  if (stages === 3)
    dependencies.push(
      ['working', 'window-0'],
      ['window-2', 'finish'],
      ['finish', 'boss']
    );
  else dependencies.push(['working', 'window-0']);
  if (
    tiles.some(
      (tile) =>
        BigInt(
          tile.kind === 'enemy' || tile.kind === 'boss'
            ? tile.value
            : tile.amount
        ) > 999n
    )
  ) {
    return reject('printed value range');
  }
  const chambers =
    stages === 2
      ? [
          [0, 1, 2, 3, 4, 5, 6, 7],
          [12, 13, 14, 15, 16, 17, 18, 19],
        ]
      : [
          [0, 1, 2, 4, 5],
          [7, 10, 11],
          [12, 13, 16, 17, 18, 19],
        ];
  const gates = stages === 2 ? [8] : [6, 14];
  const floor = new Set([...chambers.flat(), ...gates]);
  const groups = chambers.map((_, stage) =>
    tiles.filter(
      (tile) =>
        tile.id.startsWith(`resource-${stage}-`) ||
        (stage === 0
          ? tile.id === 'working'
          : stage === stages - 1 &&
            (tile.id === `window-${stage}` ||
              tile.id.startsWith('finish') ||
              tile.id === 'boss'))
    )
  );
  const transform = (cell: number) =>
    (seed % 2 === 0 ? Math.floor(cell / 4) : 4 - Math.floor(cell / 4)) * 4 +
    (Math.floor(seed / 2) % 2 === 0 ? cell % 4 : 3 - (cell % 4));
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const random = randomSource((seed + attempt * 104729) >>> 0);
    const varied =
      options.layoutMode === 'varied'
        ? variedDecisionRooms(
            seed,
            attempt,
            4,
            5,
            groups.map((group, stage) => group.length + (stage === 0 ? 1 : 0)),
            { floor, chambers, gates }
          )
        : undefined;
    if (options.layoutMode === 'varied' && !varied) continue;
    const rooms = varied?.chambers ?? chambers;
    const startCell =
      varied?.startCell ??
      chambers[0]![Math.floor(random() * chambers[0]!.length)]!;
    const placed = groups.flatMap((group, stage) => {
      const available = rooms[stage]!.filter((cell) => cell !== startCell);
      return group.map((tile) => ({
        ...tile,
        cell: transform(
          available.splice(Math.floor(random() * available.length), 1)[0]!
        ),
      }));
    });
    for (const [stage, cell] of (varied?.gates ?? gates).entries()) {
      placed.push({
        ...tiles.find((tile) => tile.id === `window-${stage}`)!,
        cell: transform(cell),
      });
    }
    const domain = new Set([...(varied?.floor ?? floor)].map(transform));
    if (!varied && attempt > 0 && options.acceptsLayout) {
      const occupied = new Set([
        transform(startCell),
        ...placed.map((tile) => tile.cell),
      ]);
      const removable = [...domain].filter((cell) => !occupied.has(cell));
      const removalCount = Math.min(removable.length, 1 + (attempt % 3));
      for (let index = 0; index < removalCount; index += 1) {
        domain.delete(
          removable.splice(Math.floor(random() * removable.length), 1)[0]!
        );
      }
    }
    const raw = generatedLevelSchema.parse({
      formatVersion: 1,
      id:
        stages === 3
          ? `decision-compact-nonbank-${seed}`
          : `decision-compact-nonbank-two-${seed}`,
      revision: 1,
      title: stages === 3 ? 'Three rooms' : 'Two rooms',
      width: 4,
      terrain: Array.from({ length: 5 }, (_, row) =>
        Array.from({ length: 4 }, (_, column) =>
          domain.has(row * 4 + column) ? '.' : '#'
        ).join('')
      ),
      startCell: transform(startCell),
      startValue: '3',
      spareLives: 0,
      tiles: placed,
    });
    if (options.acceptsLayout && !options.acceptsLayout(raw)) continue;
    const level = compileLevel(raw);
    let state = initialState(level);
    for (const tileId of witness) {
      const transition = interact(level, state, tileId);
      if (
        !transition.ok ||
        transition.state.phase === 'lost' ||
        (transition.state.phase === 'playing' && transition.state.value > 999n)
      )
        break;
      state = transition.state;
    }
    if (state.phase === 'won') return { raw, witness, dependencies };
  }
  return reject('layout or witness');
}

export function compactDecisionCandidate(
  seed: number,
  options: CompactDecisionOptions = {}
): Composition | undefined {
  if (options.programMode === 'nonbank-two-stage')
    return nonbankStageCandidate(seed, options, 2);
  if (options.programMode === 'nonbank-three-stage')
    return nonbankStageCandidate(seed, options, 3);
  const reject = (reason: string): undefined => {
    options.onReject?.(reason);
    return undefined;
  };
  const tier = options.tier ?? 'advanced';
  const { width, height } = SEASON_BOARD_LIMITS[tier];
  const stages =
    options.stages ?? (tier === 'advanced' ? 2 : tier === 'expert' ? 3 : 4);
  const bounded = options.programMode === 'bounded';
  const deposits =
    options.deposits ?? (tier === 'master' && (bounded || seed > 1) ? 2 : 1);
  if (
    !Number.isSafeInteger(seed) ||
    seed < 0 ||
    !Number.isInteger(stages) ||
    stages < 2 ||
    stages > 4 ||
    ![1, 2].includes(deposits)
  )
    return undefined;
  const tiles: RawLevel['tiles'] = [];
  const witness: string[] = [];
  const dependencies: string[][] = [];
  let bank = 0n;
  for (let index = 0; index < deposits; index += 1) {
    const amount = BigInt(7 + index * 6);
    const id = `deposit-${index}`;
    bank += amount;
    tiles.push({ id, cell: 0, kind: 'set', amount: String(amount) });
    witness.push(id, 'ledger');
  }
  const expanded = bounded || seed >= 9;
  const randomProgram = randomSource((Math.imul(seed, 7919) + 891791) >>> 0);
  const synthesis = bounded
    ? boundedDecisionProgram(seed, stages, tier)
    : undefined;
  if (bounded && !synthesis) return reject('bounded program');
  let value =
    synthesis?.working ??
    (expanded
      ? BigInt(24 + 12 * Math.floor(randomProgram() * 3))
      : BigInt(19 + 6 * (Math.floor(seed / 64) % 4)));
  tiles.push({ id: 'working', cell: 0, kind: 'set', amount: String(value) });
  witness.push('working');
  const programs: ('add' | 'subtract' | 'multiply' | 'divide' | 'enemy')[][] = [
    ['add', 'subtract'],
    ['subtract', 'add'],
    ['multiply', 'subtract'],
    ['divide', 'add'],
    ['add', 'divide'],
    ['multiply', 'divide'],
    ['enemy', 'subtract'],
    ['subtract', 'multiply'],
  ];
  const roles = ['add', 'subtract', 'multiply', 'divide', 'enemy'] as const;
  const selected =
    synthesis?.selected ??
    Array.from({ length: stages }, (_, stage) => {
      if (!expanded)
        return programs[
          stage === 0
            ? seed % 3
            : stage === 1
              ? 3 + (Math.floor(seed / 3) % 3)
              : 3 + (Math.floor(seed / 9 / 3 ** (stage - 2)) % 3)
        ]!;
      const capacity = stage === 0 ? (tier === 'advanced' ? 2 : 3) : 3;
      return Array.from(
        { length: 1 + Math.floor(randomProgram() * capacity) },
        () => roles[Math.floor(randomProgram() * roles.length)]!
      );
    });
  if (
    expanded &&
    (!selected.flat().includes('subtract') ||
      !selected.flat().includes('divide'))
  )
    return reject('missing reducing operations');
  for (let stage = 0; stage < stages; stage += 1) {
    const program = selected[stage]!;
    const windowId = `window-${stage}`;
    for (const [member, kind] of program.entries()) {
      const id = `resource-${stage}-${member}`;
      let tile: RawLevel['tiles'][number];
      const exactDivisors = [2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n].filter(
        (amount) => value % amount === 0n
      );
      const divisor =
        synthesis && kind === 'divide'
          ? synthesis.amounts[stage]![member]!
          : expanded
            ? value % 4n === 0n
              ? 4n
              : value % 3n === 0n
                ? 3n
                : (exactDivisors[0] ?? 3n)
            : BigInt(stage === 2 ? 2 : stage === 3 ? 4 : 3);
      if (kind === 'divide' && value % divisor !== 0n) {
        if (expanded) return reject('non-exact division');
        const adjustmentId = `adjust-${stage}-${member}`;
        const amount = divisor - (value % divisor);
        tiles.push({
          id: adjustmentId,
          cell: 0,
          kind: 'add',
          amount: String(amount),
        });
        value += amount;
        witness.push(adjustmentId);
        dependencies.push([adjustmentId, id]);
      }
      if (kind === 'enemy') {
        const amount = synthesis?.amounts[stage]![member] ?? value - 2n;
        tile = { id, cell: 0, kind, value: String(amount) };
        value += amount;
      } else {
        let amount =
          synthesis?.amounts[stage]![member] ??
          (kind === 'add'
            ? value + BigInt(3 + stage)
            : kind === 'subtract'
              ? expanded
                ? value / 3n > 2n
                  ? value / 3n
                  : 2n
                : BigInt(3 + stage)
              : kind === 'multiply'
                ? 2n
                : divisor);
        if (
          expanded &&
          !bounded &&
          (kind === 'add' || kind === 'subtract') &&
          (program[member + 1] === 'divide' ||
            (member === program.length - 1 &&
              selected[stage + 1]?.[0] === 'divide'))
        ) {
          const targetRemainder = member === program.length - 1 ? 2n : 0n;
          const nextValue = kind === 'add' ? value + amount : value - amount;
          const correction = (nextValue - targetRemainder + 3n) % 3n;
          amount += kind === 'add' ? (3n - correction) % 3n : correction;
        }
        tile = { id, cell: 0, kind, amount: String(amount) };
        value =
          kind === 'add'
            ? value + amount
            : kind === 'subtract'
              ? value - amount
              : kind === 'multiply'
                ? value * amount
                : value / amount;
      }
      if (value < 2n || value > 999n) return reject('resource value range');
      tiles.push(tile);
      witness.push(id);
      dependencies.push([id, windowId]);
    }
    tiles.push({
      id: windowId,
      cell: 0,
      kind: 'enemy',
      value: String(value - 1n),
      maxSurplus: '1',
    });
    witness.push(windowId);
    value = value * 2n - 1n;
    if (value > 999n) return reject('window value range');
    if (stage > 0) dependencies.push([`window-${stage - 1}`, windowId]);
  }
  if (value <= bank + 1n) return reject('insufficient ledger value');
  tiles.push({
    id: 'ledger',
    cell: 0,
    kind: 'enemy',
    value: String(value - bank - 1n),
    maxSurplus: '1',
  });
  const finishFactor = tier === 'advanced' ? 3n : 2n;
  tiles.push({
    id: 'finish',
    cell: 0,
    kind: 'multiply',
    amount: String(finishFactor),
  });
  tiles.push({
    id: 'boss',
    cell: 0,
    kind: 'boss',
    value: String((value * 2n - 1n) * finishFactor - 1n),
  });
  witness.push('ledger', 'finish', 'boss');
  dependencies.push([`window-${stages - 1}`, 'finish'], ['finish', 'boss']);
  if (
    tiles.some(
      (tile) =>
        BigInt(
          tile.kind === 'enemy' || tile.kind === 'boss'
            ? tile.value
            : tile.amount
        ) > 999n ||
        (tile.kind === 'enemy' &&
          BigInt(tile.value) + BigInt(tile.maxSurplus ?? '0') > 999n)
    )
  )
    return reject('printed value range');
  const floor = new Set<number>();
  const chambers: number[][] = [];
  const gates: number[] = [];
  let startCell: number;
  if (tier === 'advanced') {
    if (stages !== 2 || deposits !== 1) return undefined;
    for (const cell of [
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 16, 17, 18, 19,
    ])
      floor.add(cell);
    chambers.push([0, 2, 3, 4, 7, 8, 10, 11], [16, 18, 19]);
    gates.push(13);
    startCell = 5;
  } else if (tier === 'expert') {
    if (stages !== 3) return undefined;
    for (let row = 0; row < height; row += 1) {
      floor.add(row * width);
      floor.add(row * width + 1);
    }
    for (const cell of [12, 3, 4, 8, 9, 13, 14, 18, 22, 23, 24, 27, 28, 29])
      floor.add(cell);
    floor.delete(22);
    floor.delete(27);
    chambers.push(
      [...floor].filter((cell) => cell % width < 2 && cell !== 11),
      [3, 4, 8, 9, 14],
      [24, 28, 29]
    );
    gates.push(12, 18);
    startCell = 11;
    if (expanded && seed % 2 === 0 && options.layoutMode !== 'varied') {
      floor.add(22);
      floor.add(27);
    }
  } else {
    if (stages !== 4) return undefined;
    for (let row = 0; row < height; row += 1) {
      floor.add(row * width);
      floor.add(row * width + 1);
    }
    for (const cell of [
      14, 3, 4, 9, 10, 15, 16, 21, 26, 27, 28, 32, 33, 38, 39, 29, 23, 35, 41,
    ])
      floor.add(cell);
    for (const cell of [26, 32, 38]) floor.delete(cell);
    for (const cell of [5, 11, 17]) floor.add(cell);
    chambers.push(
      [...floor].filter((cell) => cell % width < 2 && cell !== 19),
      [3, 4, 9, 10, 16],
      [28, 33, 39],
      [5, 11, 17, 23, 35, 41]
    );
    gates.push(14, 21, 29);
    startCell = 19;
    if (expanded && seed % 2 === 0) {
      for (const cell of [38, 40]) floor.add(cell);
    }
  }
  const groups = chambers.map((_, stage) =>
    tiles.filter((tile) =>
      stage === 0
        ? (!tile.id.startsWith('resource-') &&
            !tile.id.startsWith('adjust-') &&
            !tile.id.startsWith('window-')) ||
          tile.id.startsWith('resource-0-') ||
          tile.id.startsWith('adjust-0-') ||
          tile.id === `window-${stages - 1}`
        : tile.id.startsWith(`resource-${stage}-`) ||
          tile.id.startsWith(`adjust-${stage}-`)
    )
  );
  if (groups.some((group, stage) => group.length > chambers[stage]!.length))
    return reject('chamber capacity');
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const random = randomSource((seed + attempt * 104729) >>> 0);
    const varied =
      options.layoutMode === 'varied' && tier !== 'master'
        ? variedDecisionRooms(
            seed,
            attempt,
            width,
            height,
            groups.map((group, stage) => group.length + (stage === 0 ? 1 : 0)),
            { floor, chambers, gates }
          )
        : undefined;
    if (options.layoutMode === 'varied' && tier !== 'master' && !varied)
      continue;
    const rooms = varied?.chambers ?? chambers;
    const origin = varied?.startCell ?? startCell;
    const placed = groups.flatMap((group, stage) => {
      const available = [...rooms[stage]!];
      return group.map((tile) => ({
        ...tile,
        cell: available.splice(Math.floor(random() * available.length), 1)[0]!,
      }));
    });
    for (let stage = 0; stage < stages - 1; stage += 1) {
      const tile = tiles.find((tile) => tile.id === `window-${stage}`)!;
      placed.push({ ...tile, cell: (varied?.gates ?? gates)[stage]! });
    }
    const domain = new Set(varied?.floor ?? floor);
    if (!varied && attempt > 0 && options.acceptsLayout) {
      const occupied = new Set([startCell, ...placed.map((tile) => tile.cell)]);
      const removable = [...domain].filter((cell) => !occupied.has(cell));
      const randomTerrain = randomSource((seed + attempt * 15485863) >>> 0);
      const removalCount = Math.min(removable.length, 1 + (attempt % 3));
      for (let index = 0; index < removalCount; index += 1) {
        const cell = removable.splice(
          Math.floor(randomTerrain() * removable.length),
          1
        )[0]!;
        domain.delete(cell);
      }
    }
    const raw = generatedLevelSchema.parse({
      formatVersion: 1,
      id: `decision-compact-${tier}-${seed}-${stages}-${deposits}`,
      revision: 1,
      title: 'Ledger',
      width,
      terrain: Array.from({ length: height }, (_, row) =>
        Array.from({ length: width }, (_, column) =>
          domain.has(row * width + column) ? '.' : '#'
        ).join('')
      ),
      startCell: origin,
      startValue: '3',
      spareLives: deposits,
      tiles: placed,
    });
    const level = compileLevel(raw);
    let state = initialState(level);
    for (const tileId of witness) {
      const transition = interact(level, state, tileId);
      if (
        !transition.ok ||
        transition.state.phase === 'lost' ||
        (transition.state.phase === 'playing' && transition.state.value > 999n)
      )
        break;
      state = transition.state;
    }
    if (state.phase === 'won' && (options.acceptsLayout?.(raw) ?? true))
      return { raw, witness, dependencies };
  }
  return reject('layout or witness');
}
