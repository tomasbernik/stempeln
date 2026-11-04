const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function calculation(periods = []) {
  const source = fs.readFileSync(require('node:path').join(__dirname, '../app-neon.js'), 'utf8');
  const constants = source.slice(source.indexOf('const TARGET_HISTORY_KEY'), source.indexOf('const TYPE_LABELS'));
  const names = ['localDate', 'isWeekday', 'expectedMinutesUntil', 'targetHistory', 'dailyTargetMinutes'];
  const functions = names.map(name => source.match(new RegExp('function ' + name + '\\([^]*?\\n}'))[0]).join('\n');
  const context = vm.createContext({ localStorage: { getItem: () => JSON.stringify(periods) }, userId: () => 'test' });
  vm.runInContext(constants + functions, context);
  return context;
}

test('2026 contract boundary and weekday totals', () => {
  const c = calculation();
  assert.equal(c.dailyTargetMinutes('2026-09-30'), 195);
  assert.equal(c.dailyTargetMinutes('2026-10-01'), 231);
  assert.equal(c.expectedMinutesUntil('2026-09-01', '2026-09-30'), 22 * 195);
  assert.equal(c.expectedMinutesUntil('2026-10-01', '2026-10-31'), 22 * 231);
  assert.equal(c.expectedMinutesUntil('2026-09-28', '2026-10-04'), 3 * 195 + 2 * 231);
  assert.equal(c.expectedMinutesUntil('2026-10-03', '2026-10-04'), 0);
  assert.equal(c.expectedMinutesUntil('2026-11-01', ''), 0);
});

test('future changes preserve history and apply within a month', () => {
  const c = calculation([{ from: '2027-01-20', weeklyHours: 25 }, { from: '2027-01-13', weeklyHours: 20 }]);
  assert.equal(c.expectedMinutesUntil('2026-09-01', '2026-09-30'), 22 * 195);
  assert.equal(c.dailyTargetMinutes('2027-01-12'), 231);
  assert.equal(c.dailyTargetMinutes('2027-01-13'), 240);
  assert.equal(c.dailyTargetMinutes('2027-01-20'), 300);
  assert.equal(c.expectedMinutesUntil('2027-01-11', '2027-01-15'), 2 * 231 + 3 * 240);
});

test('fractional minutes are rounded only after summing the period', () => {
  const c = calculation([{ from: '2027-01-01', weeklyHours: 19.26 }]);
  assert.equal(c.expectedMinutesUntil('2027-01-04', '2027-01-08'), 1156);
});
