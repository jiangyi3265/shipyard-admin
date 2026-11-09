// Dedicated localhost test backend only. Restore the test leader role in finally.
const assert = require('node:assert/strict'), crypto = require('node:crypto')
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process')
const { chromium } = require('./playwright-runtime.cjs')
const { password } = require('./test-credentials.cjs').load()
const base = 'http://127.0.0.1:8081', pc = 'http://127.0.0.1:5181', tokens = {}, passed = []
const out = path.resolve(__dirname, '../artifacts/returned-permissions')
const codeFor = uuid => String(JSON.parse(execFileSync('redis-cli', ['-p', '6383', '-n', '1', '--raw', 'GET', 'captcha_codes:' + uuid], { encoding: 'utf8', windowsHide: true })))
async function api(user, endpoint, method = 'GET', data) {
  const response = await fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(tokens[user] ? { Authorization: 'Bearer ' + tokens[user] } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) })
  const result = await response.json(); assert.equal(result.code, 200, result.msg)
  return result.data ?? result
}
async function login(user) {
  const captcha = await api(null, '/captchaImage')
  tokens[user] = (await api(null, '/login', 'POST', { username: user, password, uuid: captcha.uuid, code: codeFor(captcha.uuid) })).token
}
let browser, role
;(async () => {
  for (const user of ['admin', 'sy_leader', 'sy_manager']) await login(user)
  role = (await api('admin', '/shipyard/accounts')).roles.find(r => r.key === 'sy_leader')
  assert.ok(role.permissions.includes('shipyard:work:submit'))
  let state = await api('sy_leader', '/shipyard/bootstrap')
  const project = state.projects[0], worker = state.people[0], name = '权限撤回核对' + Date.now()
  await api('admin', '/shipyard/master/area', 'PUT', { projectId: project.id, name, area: 10, rate: 10 })
  state = await api('sy_leader', '/shipyard/bootstrap')
  const area = state.areas.find(a => a.name === name)
  const work = await api('sy_leader', '/shipyard/records', 'POST', { kind: '用工', type: '包工', projectId: project.id, areaId: area.id, requestKey: crypto.randomUUID(), people: [worker.id], allocations: { [worker.id]: 10 }, amount: 10, start: state.serverDate, end: state.serverDate, note: '退回本人单据的权限撤销回归' })
  await api('sy_manager', '/shipyard/records/' + work.id + '/review', 'POST', { version: work.version, accept: false, opinion: '测试退回后撤销提交权限' })
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = []
  page.on('pageerror', e => errors.push(e.message))
  const wait = page.waitForResponse(r => r.url().endsWith('/captchaImage'))
  await page.goto(pc + '/login')
  const captcha = await (await wait).json()
  await page.getByPlaceholder('账号', { exact: true }).fill('sy_leader')
  await page.getByPlaceholder('密码', { exact: true }).fill(password)
  await page.getByPlaceholder('验证码', { exact: true }).fill(codeFor(captcha.uuid))
  await page.getByRole('button', { name: '登 录', exact: true }).click()
  await page.getByRole('heading', { name: '待处理事项', exact: true }).waitFor()
  await page.getByRole('navigation', { name: '船厂业务导航' }).getByRole('button', { name: '申请与审批', exact: true }).click()
  await page.getByRole('textbox', { name: '搜索申请', exact: true }).fill(work.id)
  await page.getByRole('button', { name: '查看详情', exact: true }).click()
  const drawer = page.locator('.el-drawer:visible')
  assert.equal(await drawer.getByRole('button', { name: '修改并重新提交', exact: true }).isVisible(), true)
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
  await api('admin', '/shipyard/roles/' + role.id + '/permissions', 'PUT', { permissions: role.permissions.filter(p => p !== 'shipyard:work:submit') })
  await page.getByRole('button', { name: '刷新数据', exact: true }).click()
  await page.locator('button.is-loading').filter({ hasText: '刷新数据' }).waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '查看详情', exact: true }).click()
  await drawer.getByText('已退回', { exact: true }).first().waitFor()
  assert.equal(await drawer.getByRole('button', { name: '修改并重新提交', exact: true }).count(), 0)
  assert.deepEqual(errors, [])
  passed.push('真实登录与退回本人单：有提交权显示重提，撤销权限并刷新后保留详情但隐藏重提')
  fs.mkdirSync(out, { recursive: true })
  await page.screenshot({ path: path.join(out, 'read-only-returned.png'), fullPage: true })
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ completed: true, passed, errors, isolatedBackend: base, testedAt: new Date().toISOString() }, null, 2))
  console.log('PASS ' + passed[0])
})().catch(error => { console.error(require('./test-credentials.cjs').safeError(error)); process.exitCode = 1 }).finally(async () => {
  try { if (role) await api('admin', '/shipyard/roles/' + role.id + '/permissions', 'PUT', { permissions: role.permissions }) }
  finally { if (browser) await browser.close() }
})
