/**
 * Before/after performance benchmark for the numeric action ID refactor.
 *
 * Measures the specific inner-loop operations that changed:
 *   OLD: actionKey() string concat → Map<string, number> lookups + string-keyed policyPriors
 *   NEW: encodeActionIndex() O(1) lookup → Map<number, number> lookups + Float32Array policyPriors
 *
 * Run with: npx vitest run src/ai/test/perf.benchmark.test.ts --reporter=verbose
 */

import { describe, it } from 'vitest';

import { AI_MODEL_ACTION_COUNT, encodeActionIndex } from '@/ai/model/actionSpace';
import { actionKey } from '@/ai/search/shared';
import { getLegalActions, createInitialState, applyAction } from '@/domain';
import { withConfig } from '@/test/factories';
import type { TurnAction } from '@/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bench(label: string, iterations: number, fn: () => void): void {
  // Warm-up
  for (let i = 0; i < Math.min(1000, iterations / 10); i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;

  const opsPerMs = iterations / elapsed;
  console.log(
    `  ${label.padEnd(52)} ${String(Math.round(opsPerMs * 1000)).padStart(10)} ops/s  (${elapsed.toFixed(1)} ms / ${iterations} iters)`,
  );
}

function buildActions(): TurnAction[] {
  const config = withConfig({ drawRule: 'threefold' });
  const s1 = applyAction(createInitialState(config), { type: 'climbOne', source: 'A1', target: 'B2' }, config);
  const s2 = applyAction(s1, { type: 'climbOne', source: 'F6', target: 'E5' }, config);
  const s3 = applyAction(s2, { type: 'climbOne', source: 'B2', target: 'C3' }, config);
  return getLegalActions(s3, config); // ~20-30 actions
}

// ---------------------------------------------------------------------------
// Benchmark suite
// ---------------------------------------------------------------------------

describe('numeric-action-id refactor: before vs after', () => {
  const actions = buildActions();
  const ITERS = 200_000;

  console.log(`\n  Actions in test position: ${actions.length}`);
  console.log('');

  // --- 1. Key generation ---------------------------------------------------

  it('1. key generation: actionKey (string) vs encodeActionIndex (numeric)', () => {
    console.log('\n  [1] Key generation per action:');

    bench('OLD  actionKey(action) → string', ITERS, () => {
      for (const action of actions) actionKey(action);
    });

    bench('NEW  encodeActionIndex(action) → number', ITERS, () => {
      for (const action of actions) encodeActionIndex(action);
    });
  }, 30_000);

  // --- 2. History score lookup ----------------------------------------------

  it('2. historyScores lookup: Map<string> vs Map<number>', () => {
    console.log('\n  [2] History score lookup per batch of actions:');

    const stringKeys = actions.map(actionKey);
    const numericIds = actions.map((a) => encodeActionIndex(a) ?? -1);

    // Prefill maps with realistic sizes (~500 entries = mid-search state)
    const stringMap = new Map<string, number>();
    const numericMap = new Map<number, number>();
    for (let i = 0; i < 500; i++) {
      stringMap.set(`climbOne:${String.fromCharCode(65 + (i % 6))}${(i % 6) + 1}:${String.fromCharCode(65 + ((i + 1) % 6))}${((i + 1) % 6) + 1}`, i * 24);
      numericMap.set(i * 5, i * 24);
    }
    // Also add the actual action keys
    for (let i = 0; i < stringKeys.length; i++) {
      stringMap.set(stringKeys[i]!, (i + 1) * 400);
      numericMap.set(numericIds[i]!, (i + 1) * 400);
    }

    bench('OLD  map.get(stringKey)', ITERS, () => {
      for (const key of stringKeys) stringMap.get(key);
    });

    bench('NEW  map.get(numericId)', ITERS, () => {
      for (const id of numericIds) numericMap.get(id);
    });
  });

  // --- 3. Continuation score lookup ----------------------------------------

  it('3. continuationScores: string concat key vs integer pair key', () => {
    console.log('\n  [3] Continuation score lookup per batch (with prev action):');

    const prevKey = actionKey(actions[0]!);
    const prevId = encodeActionIndex(actions[0]!) ?? -1;
    const stringKeys = actions.map(actionKey);
    const numericIds = actions.map((a) => encodeActionIndex(a) ?? -1);

    const stringMap = new Map<string, number>();
    const numericMap = new Map<number, number>();
    for (let i = 0; i < stringKeys.length; i++) {
      stringMap.set(`${prevKey}->${stringKeys[i]}`, (i + 1) * 250);
      numericMap.set(prevId * AI_MODEL_ACTION_COUNT + numericIds[i]!, (i + 1) * 250);
    }

    bench('OLD  map.get(`${prevKey}->${key}`)  [string alloc]', ITERS, () => {
      for (const key of stringKeys) stringMap.get(`${prevKey}->${key}`);
    });

    bench('NEW  map.get(prevId * 2736 + id)    [no alloc]', ITERS, () => {
      for (const id of numericIds) numericMap.get(prevId * AI_MODEL_ACTION_COUNT + id);
    });
  });

  // --- 4. Policy priors lookup ----------------------------------------------

  it('4. policyPriors: Record<string, number> vs Float32Array', () => {
    console.log('\n  [4] Policy prior lookup per batch of actions:');

    const stringKeys = actions.map(actionKey);
    const numericIds = actions.map((a) => encodeActionIndex(a) ?? -1);

    const recordPriors: Record<string, number> = {};
    const arrayPriors = new Float32Array(AI_MODEL_ACTION_COUNT);
    for (let i = 0; i < stringKeys.length; i++) {
      recordPriors[stringKeys[i]!] = (i + 1) / stringKeys.length;
      arrayPriors[numericIds[i]!] = (i + 1) / numericIds.length;
    }

    bench('OLD  record[stringKey]', ITERS, () => {
      for (const key of stringKeys) recordPriors[key];
    });

    bench('NEW  float32Array[numericId]', ITERS, () => {
      for (const id of numericIds) arrayPriors[id];
    });
  });

  // --- 5. Killer move check ------------------------------------------------

  it('5. killer check: TurnAction[] isSameAction vs number[] includes', () => {
    console.log('\n  [5] Killer move match check per batch of actions:');

    const killerActions = actions.slice(0, 2);
    const killerIds = killerActions.map((a) => encodeActionIndex(a) ?? -1);
    const numericIds = actions.map((a) => encodeActionIndex(a) ?? -1);

    bench('OLD  killers.some(k => actionKey(k) === actionKey(a))', ITERS, () => {
      for (const action of actions) {
        killerActions.some((k) => actionKey(k) === actionKey(action));
      }
    });

    bench('NEW  killerIds.includes(id)', ITERS, () => {
      for (const id of numericIds) {
        killerIds.includes(id);
      }
    });
  }, 30_000);

  // --- 6. Combined inner-loop simulation -----------------------------------

  it('6. combined inner-loop: full precompute scoring pass (string vs numeric)', () => {
    console.log('\n  [6] Full scoring pass simulation (one ordering call):');

    const stringKeys = actions.map(actionKey);
    const numericIds = actions.map((a) => encodeActionIndex(a) ?? -1);
    const prevStringKey = stringKeys[0]!;
    const prevNumericId = numericIds[0]!;

    // String world
    const histStr = new Map<string, number>(stringKeys.map((k, i) => [k, (i + 1) * 400]));
    const contStr = new Map<string, number>(
      stringKeys.map((k, i) => [`${prevStringKey}->${k}`, (i + 1) * 250]),
    );
    const polStr: Record<string, number> = Object.fromEntries(
      stringKeys.map((k, i) => [k, (i + 1) / stringKeys.length]),
    );

    // Numeric world
    const histNum = new Map<number, number>(numericIds.map((id, i) => [id, (i + 1) * 400]));
    const contNum = new Map<number, number>(
      numericIds.map((id, i) => [prevNumericId * AI_MODEL_ACTION_COUNT + id, (i + 1) * 250]),
    );
    const polNum = new Float32Array(AI_MODEL_ACTION_COUNT);
    numericIds.forEach((id, i) => { polNum[id] = (i + 1) / numericIds.length; });

    bench('OLD  per-action: get history + get continuation + get policyPrior', ITERS, () => {
      for (let i = 0; i < stringKeys.length; i++) {
        const k = stringKeys[i]!;
        histStr.get(k);
        contStr.get(`${prevStringKey}->${k}`);
        polStr[k];
      }
    });

    bench('NEW  per-action: get history + get continuation + get policyPrior', ITERS, () => {
      for (let i = 0; i < numericIds.length; i++) {
        const id = numericIds[i]!;
        histNum.get(id);
        contNum.get(prevNumericId * AI_MODEL_ACTION_COUNT + id);
        polNum[id];
      }
    });
  });
});
