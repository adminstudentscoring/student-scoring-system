/**
 * Regression checks for lesson quota tier math (must match server + client salesCartCanFullyPayWithLessonQuota).
 */
import test from 'node:test';
import assert from 'node:assert';

function unitCents(price: number, n: number): number {
  return Math.round((price * 100) / n);
}

test('tier: $1800 / 8 lessons → $225 → 22500 cents key', () => {
  assert.strictEqual(unitCents(1800, 8), 22500);
});

test('tier: $3825 / 8 lessons (full package line)', () => {
  assert.strictEqual(unitCents(3825, 8), 47813);
});

test('quota object lookup uses string key like server', () => {
  const q: Record<string, number> = { '22500': 8 };
  const key = String(22500);
  assert.strictEqual(q[key], 8);
});
