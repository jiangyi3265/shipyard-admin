// Read-only H5 follow-up for the exact area completed by verify-pc-area-completion.cjs.
const { chromium } = require('./playwright-runtime.cjs')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), { execFileSync } = require('node:child_process')
const password = require('./test-credentials.cjs').load().password
const out = path.resolve(__dirname, '../artifacts/pc-completion-1105'), pc = JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8'))
assert.equal(pc.completed, true, 'PC workflow must finish before the read-only H5 check')
const base = 'http://127.0.0.1:5179', errors = [], blocked = []
let browser, page
;(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) })
  const context = await browser.newContext({ viewport: { width: 390, height: 950 } })
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin !== base || (!['GET', 'HEAD'].includes(request.method()) && url.pathname !== '/api/login')) { blocked.push(request.method() + ' ' + url.pathname); return route.abort() }
    return route.continue()
  })
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message))
  const captcha = page.waitForResponse(r => new URL(r.url()).pathname === '/api/captchaImage'); await page.goto(base + '/#/pages/login/index')
  const challenge = await (await captcha).json()
  const code = JSON.parse(execFileSync('redis-cli', ['-h', '127.0.0.1', '-p', '6383', '-n', '1', '--raw', 'GET', 'captcha_codes:' + challenge.uuid], { encoding: 'utf8', windowsHide: true, timeout: 10000 }))
  assert.ok(code, 'Captcha must originate in isolated Redis DB 1')
  const input = label => page.locator('uni-input[aria-label="' + label + '"] input')
  await input('账号').fill('sy_leader'); await input('密码').fill(password); await input('验证码').fill(String(code)); await input('验证码').press('Tab')
  const signed = page.waitForResponse(r => new URL(r.url()).pathname === '/api/login'); await page.locator('.login-panel .btn.primary').click(); assert.equal((await (await signed).json()).code, 200)
  await page.locator('.mobile-app .page-content').waitFor()
  const loaded = page.waitForResponse(r => new URL(r.url()).pathname === '/api/shipyard/bootstrap')
  await page.goto(base + '/#/pages/areas/index', { waitUntil: 'networkidle' })
  const state = (await (await loaded).json()).data, area = state.areas.find(row => String(row.id) === String(pc.fixtures.areaId))
  assert.equal(area.status, '已完工'); assert.ok(area.completedAt); assert.equal(area.workers.find(worker => Number(worker.id) === Number(pc.fixtures.workerId)).name, pc.fixtures.areaName.replace('PC完工区域', 'PC名单工人'))
  assert.equal(state.records.find(row => row.id === pc.fixtures.recordId).status, '待结算')
  const card = page.locator('.area-card').filter({ hasText: pc.fixtures.areaName })
  await card.getByText('已完工', { exact: true }).waitFor(); await card.locator('.people-toggle').click()
  await card.locator('.worker-list').getByText(area.workers[0].name, { exact: true }).waitFor()
  assert.equal(await card.locator('uni-button').filter({ hasText: '提交完工' }).count(), 0)
  assert.equal(await card.locator('uni-button').filter({ hasText: '安排用工' }).count(), 0)
  await card.screenshot({ path: path.join(out, 'h5-same-area.png') })
  assert.deepEqual(errors, []); assert.deepEqual(blocked, [])
  const result = { completed: true, testedAt: new Date().toISOString(), fixtureIds: pc.fixtures, readOnly: true, errors, blocked, passed: ['H5读取PC经理确认的同一区域已完工、人员姓名与待结算原单，完工后无新增用工或重复完工入口'] }
  fs.writeFileSync(path.join(out, 'h5-readback.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2))
})().catch(async error => {
  const message = require('./test-credentials.cjs').safeError(error)
  if (page) await page.screenshot({ path: path.join(out, 'h5-failure.png'), fullPage: true }).catch(() => {})
  fs.writeFileSync(path.join(out, 'h5-readback.json'), JSON.stringify({ completed: false, message, errors, blocked }, null, 2)); console.error(message); process.exitCode = 1
}).finally(async () => { if (browser) await browser.close() })
