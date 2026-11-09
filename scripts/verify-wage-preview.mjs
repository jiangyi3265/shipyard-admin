import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { reactive, computed, ref, watch } from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'
import { hourlyWageCents, sumHourlyWages } from '../src/utils/wage-preview.js'

const mobileSource = fs.readFileSync(new URL('../../船厂/services/wage-preview.js', import.meta.url), 'utf8')
const pcSource = fs.readFileSync(new URL('../src/utils/wage-preview.js', import.meta.url), 'utf8')
assert.equal(mobileSource, pcSource, 'PC and mobile must use identical rounding rules')
const mobile = await import('data:text/javascript;base64,' + Buffer.from(mobileSource).toString('base64'))
const rows = [{ rate: 35.35, hours: 1.5 }, { rate: '35.35', hours: '1.50' }]
assert.equal(sumHourlyWages(rows), 106.06)
assert.equal(mobile.sumHourlyWages(rows), 106.06)

for (const [rate, hours, cents] of [[2.01, 0.5, 101], [0.01, 0.49, 0], [0.01, 0.5, 1],
  [0.01, 0.51, 1], [0.07, 0.5, 4], ['35.35', '1.5', 5303], ['+2.01', '.5', 101],
  ['3.535e1', '1.50', 5303]]) {
  assert.equal(hourlyWageCents(rate, hours), cents, `${rate} × ${hours} must round HALF_UP`)
  assert.equal(mobile.hourlyWageCents(rate, hours), cents)
}
for (const [rate, hours] of [[35.35, ''], ['', 8], [undefined, 8], ['invalid', 8],
  [-35, 8], [35, -1], [1.005, 1], [35, 24.01], [1000000000, 1]]) {
  assert.equal(hourlyWageCents(rate, hours), 0, 'Incomplete/invalid form values must not display NaN or rounded input')
}

// Independent integer reference covers half-cent edges and the backend's maximum valid inputs.
for (const rateUnits of [1, 7, 201, 3535, 12345, 99999999999]) {
  for (const hourUnits of [1, 49, 50, 51, 99, 100, 150, 200, 1600, 2400]) {
    const expected = Number((BigInt(rateUnits) * BigInt(hourUnits) + 50n) / 100n)
    assert.equal(hourlyWageCents((rateUnits / 100).toFixed(2), (hourUnits / 100).toFixed(2)), expected)
  }
}
const maxRows = Array.from({ length: 200 }, () => ({ rate: '999999999.99', hours: 24 }))
assert.equal(sumHourlyWages(maxRows), Number(200n * ((99999999999n * 2400n + 50n) / 100n)) / 100)
console.log('PASS identical PC/mobile helpers: per-person HALF_UP, half-cent boundaries, decimal input and 200-person maximum')

// Execute the real RecordForm setup with Vue reactivity; no browser or backend fixture writes.
const source = fs.readFileSync(new URL('../src/views/shipyard/components/RecordForm.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source)
assert.deepEqual(errors, [])
compileScript(descriptor, { id: 'wage-preview-form-test' })
const setup = descriptor.scriptSetup.content.replace(/^import .*$/gm, '')
function formState(record, draft) {
  const submissions = []
  const props = { kind: '用工', projectId: 1, record, data: {
    user: { id: 10 }, serverDate: '2026-11-04', projects: [{ id: 1, name: '工程一' }],
    areas: [{ id: '7', projectId: 1, name: 'A 区', completedAt: null }],
    people: [{ id: 1, name: '工人一', rate: 35.35 }, { id: 2, name: '工人二', rate: 35.35 }]
  }, write: async (path, body, method) => { submissions.push({ path, body: JSON.parse(JSON.stringify(body)), method }); return body } }
  // Same calendar helpers as src/api/shipyard.js (the form limits backfill dates with them).
  const dayText = date => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
  const shiftDay = (day, days) => { const [y, m, d] = String(day).split('-').map(Number); return dayText(new Date(y, m - 1, d + days)) }
  const sandbox = { reactive, computed, ref, watch, dayText, shiftDay, sumHourlyWages, defineProps: () => props, defineEmits: () => () => {},
    requestKey: () => 'wage_preview_test_request', ElMessage: { success() {} },
    localStorage: { getItem: () => draft ? JSON.stringify(draft) : null, removeItem() {}, setItem() {} } }
  vm.runInNewContext(setup + '\nglobalThis.result = {form, areas, people, total, submit}', sandbox)
  return { ...sandbox.result, submissions }
}
const returned = { id: 'returned-work', version: 2, projectId: 1, areaId: 7, type: '点工',
  people: [1, 2], hours: { 1: 1.5, 2: 1.5 }, date: '2026-11-04', note: '修改后重提', files: [] }
const edit = formState(returned)
assert.equal(edit.form.areaId, '7')
assert.equal(edit.areas.value.find(a => String(a.id) === edit.form.areaId)?.name, 'A 区', 'Returned-record area must initially match its visible option')
assert.equal(edit.total.value, 106.06)
await edit.submit()
assert.equal(edit.submissions.length, 1)
assert.equal(edit.submissions[0].path, '/records/returned-work')
assert.equal(edit.submissions[0].method, 'PUT')
assert.equal(edit.submissions[0].body.areaId, '7')
assert.equal(edit.submissions[0].body.version, 2)
edit.form.type = '加班'; edit.form.duration = 1.5
assert.equal(edit.total.value, 106.06)
edit.form.type = '包工'; edit.form.allocations = { 1: 50, 2: 56.06 }
assert.equal(edit.total.value, 106.06, 'Contract allocations must not be converted into hourly wages')
const draft = formState(undefined, { projectId: 1, areaId: 7, type: '点工', people: [1], hours: { 1: 1.5 } })
assert.equal(draft.form.areaId, '7', 'Restored numeric draft IDs must match area options too')
console.log('PASS actual RecordForm setup: numeric returned/draft area IDs, hourly/overtime previews and unchanged PUT resubmission')
