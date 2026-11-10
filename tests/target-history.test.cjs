const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function calculation(periods = []) {
  const source = fs.readFileSync(require('node:path').join(__dirname, '../app-neon.js'), 'utf8');
  const constants = source.slice(source.indexOf('const TARGET_HISTORY_KEY'), source.indexOf('const TYPE_LABELS'));
  const names = [
    'localDate',
    'minutesFromIso',
    'workedMinutes',
    'isWeekday',
    'expectedMinutesUntil',
    'entriesForRange',
    'entriesGroupedByDate',
    'creditedMinutesForDate',
    'creditedMinutes',
    'expectedMinutesForEntries',
    'balanceMinutes',
    'localTargetHistory',
    'targetHistory',
    'dailyTargetMinutes',
    'formatDuration',
    'formatDecimalHours',
    'formatDurationWithDecimal',
    'formatSignedDuration',
  ];
  const functions = names.map(name => source.match(new RegExp('function ' + name + '\\([^]*?\\n}'))[0]).join('\n');
  const context = vm.createContext({ localStorage: { getItem: () => JSON.stringify(periods) }, userId: () => 'test' });
  vm.runInContext(constants + functions, context);
  context.BALANCE_START_DATE = vm.runInContext('BALANCE_START_DATE', context);
  return context;
}

test('2026 contract boundary and weekday totals', () => {
  const c = calculation();
  assert.equal(c.dailyTargetMinutes('2026-09-30'), 195);
  assert.equal(c.dailyTargetMinutes('2026-10-01'), 195);
  assert.equal(c.dailyTargetMinutes('2026-10-02'), 285);
  assert.equal(c.dailyTargetMinutes('2026-10-05'), 285);
  assert.equal(c.dailyTargetMinutes('2026-10-06'), 195);
  assert.equal(c.expectedMinutesUntil('2026-09-01', '2026-09-30'), 22 * 195);
  assert.equal(c.expectedMinutesUntil('2026-10-01', '2026-10-31'), 85 * 60);
  assert.equal(c.expectedMinutesUntil('2026-09-28', '2026-10-04'), 4 * 195 + 285);
  assert.equal(c.expectedMinutesUntil('2026-10-03', '2026-10-04'), 0);
  assert.equal(c.expectedMinutesUntil('2026-11-01', ''), 0);
});

test('future changes preserve history and apply within a month', () => {
  const c = calculation([{ from: '2027-01-20', weeklyHours: 25 }, { from: '2027-01-13', weeklyHours: 20 }]);
  assert.equal(c.expectedMinutesUntil('2026-09-01', '2026-09-30'), 22 * 195);
  assert.equal(c.dailyTargetMinutes('2027-01-12'), 195);
  assert.equal(c.dailyTargetMinutes('2027-01-13'), 240);
  assert.equal(c.dailyTargetMinutes('2027-01-20'), 300);
  assert.equal(c.expectedMinutesUntil('2027-01-11', '2027-01-15'), 285 + 195 + 3 * 240);
});

test('fractional minutes are rounded only after summing the period', () => {
  const c = calculation([{ from: '2027-01-01', weeklyHours: 19.26 }]);
  assert.equal(c.expectedMinutesUntil('2027-01-04', '2027-01-08'), 1156);
});

test('October balance displays overtime and missing hours with the new target', () => {
  const c = calculation();
  const expected = c.expectedMinutesUntil('2026-10-05', '2026-10-09');

  assert.equal(expected, 5 * 231);
  assert.equal(c.formatSignedDuration(20 * 60 - expected), '+0:45');
  assert.equal(c.formatSignedDuration(18 * 60 - expected), '-1:15');
});

test('vacation credits the daily target and keeps the balance unchanged', () => {
  const c = calculation();
  const entries = [{ work_date: '2026-10-05', type: 'vacation' }];

  assert.equal(c.expectedMinutesForEntries('2026-10-05', '2026-10-09', entries), 19.25 * 60);
  assert.equal(c.creditedMinutes(entries), 285);
});

test('sickness credits the daily target without clock times', () => {
  const c = calculation();
  const entries = [{ work_date: '2026-10-06', type: 'sick', clock_in: null, clock_out: null }];

  assert.equal(c.expectedMinutesForEntries('2026-10-06', '2026-10-06', entries), 195);
  assert.equal(c.creditedMinutes(entries), 195);
});

test('sickness and work on the same day do not double the credit', () => {
  const c = calculation();
  const entries = [
    { work_date: '2026-07-06', type: 'sick', clock_in: null, clock_out: null },
    { work_date: '2026-07-06', type: 'work', clock_in: '2026-07-06T08:00:00', clock_out: '2026-07-06T10:00:00', break_minutes: 0 },
  ];

  assert.equal(c.creditedMinutes(entries), 195);
});

test('normal work uses only the actually recorded hours', () => {
  const c = calculation();
  const entries = [{
    work_date: '2026-10-05',
    type: 'work',
    clock_in: '2026-10-05T08:30:00',
    clock_out: '2026-10-05T12:30:00',
    break_minutes: 0,
  }];

  assert.equal(c.dailyTargetMinutes('2026-10-05'), 285);
  assert.equal(c.creditedMinutes(entries), 240);
});

test('durations show clock time and decimal hours', () => {
  const c = calculation();
  assert.equal(c.formatDurationWithDecimal(195), '3:15 (3,25 h)');
  assert.equal(c.formatDurationWithDecimal(285), '4:45 (4,75 h)');
});

test('monthly and cumulative balances use different start dates', () => {
  const c = calculation();
  const entries = [{ work_date: '2026-07-06', type: 'sick', clock_in: null, clock_out: null }];

  assert.equal(c.balanceMinutes(entries, '2026-07-01', '2026-07-06'), -3 * 195);
  assert.equal(c.balanceMinutes(entries, c.BALANCE_START_DATE, '2026-07-06'), -25 * 195);
});

test('balance period starts on 1 June 2026', () => {
  const c = calculation();
  assert.equal(c.BALANCE_START_DATE, '2026-06-01');
  assert.equal(c.expectedMinutesForEntries(c.BALANCE_START_DATE, '2026-06-05', []), 5 * 195);
});
