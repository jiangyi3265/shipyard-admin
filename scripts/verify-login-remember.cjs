// Only local fixture responses; no real credentials or backend requests.
const { chromium } = require('./playwright-runtime.cjs')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const base = process.env.PC_AUDIT_URL || 'http://127.0.0.1:5180'
const apiPrefix = process.env.PC_AUDIT_API_PREFIX || '/dev-api'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname))
const out = path.resolve(__dirname, '../artifacts/public-import-login')
fs.mkdirSync(out, { recursive: true })
const passed = [], errors = [], blocked = []
let browser, page, logins = 0
const bootstrap = { user: { id: 10, name: '本地测试管理员' }, roles: ['sy_admin'], grants: ['*:*:*'], projects: [], areas: [], people: [], records: [], payroll: [], attendance: [], transactions: [], notifications: [], serverDate: '2026-11-05' }
;(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) })
  const context = await browser.newContext()
  await context.addCookies([
    { name: 'username', value: 'remember-fixture', url: base },
    { name: 'password', value: 'legacy-fixture-not-a-real-password', url: base },
    { name: 'rememberMe', value: 'true', url: base }
  ])
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    const reply = value => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) })
    if (url.origin !== new URL(base).origin) { blocked.push(url.origin + url.pathname); return route.abort() }
    if (!url.pathname.startsWith(apiPrefix + '/')) {
      if (/^\/(?:api|dev-api|prod-api)\//.test(url.pathname) || request.method() !== 'GET') { blocked.push(url.pathname); return route.abort() }
      return route.continue()
    }
    const endpoint = url.pathname.slice(apiPrefix.length)
    if (endpoint === '/captchaImage') return reply({ code: 200, captchaEnabled: false })
    if (endpoint === '/login') { logins++; return reply({ code: 200, token: 'local-invalid-fixture-token' }) }
    if (endpoint === '/getInfo') return reply({ code: 200, user: { userId: 10, userName: 'remember-fixture', nickName: '本地测试管理员' }, roles: ['sy_admin'], permissions: ['*:*:*'] })
    if (endpoint === '/getRouters') return reply({ code: 200, data: [] })
    if (endpoint === '/shipyard/bootstrap') return reply({ code: 200, data: bootstrap })
    blocked.push(endpoint); return reply({ code: 503, msg: 'Unexpected fixture request blocked' })
  })
  page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  const user = () => page.getByPlaceholder('账号', { exact: true })
  const password = () => page.getByPlaceholder('密码', { exact: true })
  const remember = () => page.getByRole('checkbox', { name: '记住账号', exact: true })
  const cookies = async () => Object.fromEntries((await context.cookies()).map(cookie => [cookie.name, cookie.value]))
  const openLogin = () => page.goto(base + '/login', { waitUntil: 'networkidle' })
  const login = async () => {
    await password().fill('Fixture-only-input')
    await page.getByRole('button', { name: '登 录', exact: true }).click()
    await page.getByRole('heading', { name: '我的待办', exact: true }).waitFor()
  }
  await openLogin()
  assert.equal(await user().inputValue(), 'remember-fixture')
  assert.equal(await password().inputValue(), '')
  assert.equal(await remember().isChecked(), true)
  assert.equal((await cookies()).password, undefined)
  passed.push('旧版密码 Cookie 自动清理，仅恢复账号和勾选状态')
  await login()
  assert.equal((await cookies()).username, 'remember-fixture')
  assert.equal((await cookies()).rememberMe, 'true')
  assert.equal((await cookies()).password, undefined)
  passed.push('勾选记住账号后成功登录，不持久化密码')
  await context.clearCookies({ name: 'Admin-Token' }); await openLogin()
  assert.equal(await user().inputValue(), 'remember-fixture')
  assert.equal(await password().inputValue(), '')
  passed.push('再次打开登录页账号保留、密码为空')
  await page.getByText('记住账号', { exact: true }).click()
  assert.equal(await remember().isChecked(), false)
  await login()
  const cleared = await cookies()
  for (const key of ['username', 'password', 'rememberMe']) assert.equal(cleared[key], undefined)
  passed.push('取消记住账号并登录后清除全部记忆 Cookie')
  await context.clearCookies({ name: 'Admin-Token' })
  await context.addCookies([{ name: 'rememberMe', value: 'false', url: base }])
  await openLogin(); assert.equal(await remember().isChecked(), false)
  assert.equal(await user().inputValue(), ''); assert.equal(await password().inputValue(), '')
  passed.push('字符串 false 不被误判为已勾选，空账号密码正常显示')
  assert.equal(logins, 2); assert.deepEqual(errors, []); assert.deepEqual(blocked, [])
  await page.screenshot({ path: path.join(out, 'login.png'), fullPage: true })
  const result = { completed: true, passed, errors, blocked, fixtureResponses: true, realBusinessWrites: 0, testedAt: new Date().toISOString() }
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
})().catch(async error => {
  const message = String(error.message).split('\n')[0]
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ completed: false, passed, errors, blocked, message }, null, 2))
  if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {})
  console.error(message); process.exitCode = 1
}).finally(async () => { if (browser) await browser.close() })
