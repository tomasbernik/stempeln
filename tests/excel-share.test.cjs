const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('email sharing uses an Excel attachment instead of HTML', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../app-neon.js'), 'utf8');
  const excelFileName = source.match(/function excelFileName\(\) \{[^]*?\n\}/)[0];
  const shareExcel = source.match(/async function shareExcel\(\) \{[^]*?\n\}/)[0];
  const shared = [];

  class TestFile {
    constructor(parts, name, options) {
      this.parts = parts;
      this.name = name;
      this.type = options.type;
    }
  }

  const context = vm.createContext({
    controls: { month: { value: '2026-10' } },
    excelContent: () => '<table></table>',
    File: TestFile,
    navigator: {
      canShare: () => true,
      share: async (payload) => shared.push(payload),
    },
    setMessage: () => {},
    downloadExcel: () => assert.fail('download fallback should not run'),
  });

  vm.runInContext(`${excelFileName}\n${shareExcel}`, context);
  await context.shareExcel();

  assert.equal(shared.length, 1);
  assert.equal(shared[0].files[0].name, 'zeiterfassung-2026-10.xls');
  assert.equal(shared[0].files[0].type, 'application/vnd.ms-excel;charset=utf-8');
});
