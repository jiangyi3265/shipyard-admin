// Browser regression fixtures only: no real accounts, database calls or business writes.
const { chromium } = require('./playwright-runtime.cjs')
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const base = process.env.PC_AUDIT_URL || 'http://127.0.0.1:5193', prefix = '/dev-api'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname))
const out = path.resolve(__dirname, '../artifacts/pc-session-resilience')
fs.mkdirSync(out, { recursive: true })
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2n8AAAAASUVORK5CYII='
const fixture = () => ({ user: { id: 10, name: '本地测试组长' }, roles: ['sy_leader'], grants: ['shipyard:work:submit'], serverDate: '2026-11-06', projects: [{ id: 1, name: '隔离测试工程' }], areas: [], people: [], records: [], payroll: [], transactions: [], attendance: [], notifications: [] })
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const passed = [], failed = []
async function session(browser, options = {}) {
  const state = fixture(), errors = [], unexpected = [], requests = []
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  if (options.signedIn) await context.addCookies([{ name: 'Admin-Token', value: 'local-only-session-fixture', url: base }])
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), endpoint = url.pathname.slice(prefix.length)
    const reply = value => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) })
    if (url.origin !== new URL(base).origin) { unexpected.push(request.method() + ' ' + url.origin + url.pathname); return route.abort() }
    if (!url.pathname.startsWith(prefix + '/')) {
      if (!['GET', 'HEAD'].includes(request.method()) || /^\/(api|prod-api)\//.test(url.pathname)) { unexpected.push(url.pathname); return route.abort() }
      return route.continue()
    }
    requests.push({ endpoint, method: request.method(), body: request.postData() })
    if (options.handle && await options.handle({ endpoint, method: request.method(), request, reply, state })) return
    if (endpoint === '/captchaImage') return reply({ code: 200, captchaEnabled: true, uuid: 'latest-challenge', img: png })
    if (endpoint === '/login') return reply({ code: 200, token: 'local-only-session-fixture' })
    if (endpoint === '/logout') return reply({ code: 200 })
    if (endpoint === '/getInfo') return reply({ code: 200, user: { userId: state.user.id, userName: 'fixture', nickName: state.user.name }, roles: state.roles, permissions: state.grants })
    if (endpoint === '/getRouters') return reply({ code: 200, data: [] })
    if (endpoint === '/shipyard/bootstrap') return reply({ code: 200, data: state })
    unexpected.push(request.method() + ' ' + endpoint)
    return reply({ code: 503, msg: '未配置测试请求已阻止' })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(7000)
  page.on('pageerror', error => errors.push(error.message))
  return { page, context, state, errors, unexpected, requests }
}
async function fillLogin(page) {
  await page.getByPlaceholder('账号', { exact: true }).fill('fixture')
  await page.getByPlaceholder('密码', { exact: true }).fill('Fixture-only-value')
  await page.getByPlaceholder('验证码', { exact: true }).fill('abcd')
}
async function check(name, run) {
  try { await run(); passed.push(name); console.log('PASS ' + name) }
  catch (error) { failed.push({ name, message: error.message }); console.log('FAIL ' + name + ': ' + error.message.split('\n')[0]) }
  fs.writeFileSync(path.join(out, 'progress.json'), JSON.stringify({ passed, failed, completed: false }, null, 2))
}
;(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) })
  try {
    await check('登录请求未完成时反复按回车仍保持单次提交和加载状态', async () => {
      const started = deferred(), release = deferred()
      const s = await session(browser, { handle: async ({ endpoint, reply }) => {
        if (endpoint !== '/login') return false
        started.resolve(); await release.promise; await reply({ code: 200, token: 'local-only-session-fixture' }); return true
      } })
      try {
        await s.page.goto(base + '/login'); await fillLogin(s.page)
        await s.page.getByPlaceholder('密码', { exact: true }).press('Enter'); await started.promise
        await s.page.getByPlaceholder('密码', { exact: true }).press('Enter')
        await s.page.waitForTimeout(150)
        assert.equal(await s.page.getByRole('button', { name: '登 录 中...', exact: true }).count(), 1, 'Pending login must remain loading after another Enter')
        assert.equal(s.requests.filter(r => r.endpoint === '/login').length, 1)
        release.resolve(); await s.page.getByRole('heading', { name: '待处理事项', exact: true }).waitFor()
        assert.deepEqual(s.errors, []); assert.deepEqual(s.unexpected, [])
      } finally { release.resolve(); await s.context.close() }
    })
    await check('验证码加载失败给出中文提示且不产生未处理异常，点击后可恢复', async () => {
      let attempts = 0
      const s = await session(browser, { handle: async ({ endpoint, reply }) => {
        if (endpoint !== '/captchaImage' || ++attempts > 1) return false
        await reply({ code: 500, msg: '验证码服务暂不可用，请重试' }); return true
      } })
      try {
        await s.page.goto(base + '/login')
        await s.page.getByText('验证码服务暂不可用，请重试', { exact: true }).waitFor()
        await s.page.locator('.login-code').click()
        await s.page.waitForFunction(() => document.querySelector('.login-code-img')?.src.startsWith('data:'))
        await fillLogin(s.page); await s.page.getByRole('button', { name: '登 录', exact: true }).click()
        await s.page.getByRole('heading', { name: '待处理事项', exact: true }).waitFor()
        assert.deepEqual(s.errors, []); assert.deepEqual(s.unexpected, [])
      } finally { await s.context.close() }
    })
    await check('连续刷新验证码时较慢旧响应不能覆盖新验证码', async () => {
      let count = 0
      const started = deferred(), release = deferred()
      const s = await session(browser, { handle: async ({ endpoint, reply }) => {
        if (endpoint !== '/captchaImage') return false
        const ordinal = ++count
        if (ordinal === 2) { started.resolve(); await release.promise }
        await reply({ code: 200, captchaEnabled: true, uuid: ordinal === 2 ? 'obsolete-challenge' : 'latest-challenge', img: png }); return true
      } })
      try {
        await s.page.goto(base + '/login', { waitUntil: 'networkidle' })
        await s.page.locator('.login-code-img').click(); await started.promise
        const second = s.page.waitForResponse(r => r.url().endsWith('/captchaImage'))
        second.catch(() => {})
        await s.page.locator('.login-code-img').click(); await second
        const first = s.page.waitForResponse(r => r.url().endsWith('/captchaImage'))
        first.catch(() => {})
        release.resolve(); await first
        await fillLogin(s.page); await s.page.getByRole('button', { name: '登 录', exact: true }).click()
        await s.page.getByRole('heading', { name: '待处理事项', exact: true }).waitFor()
        const login = s.requests.find(r => r.endpoint === '/login')
        assert.equal(JSON.parse(login.body).uuid, 'latest-challenge')
        assert.deepEqual(s.errors, []); assert.deepEqual(s.unexpected, [])
      } finally { release.resolve(); await s.context.close() }
    })
    await check('失效账号冷启动且退出接口报错时仍清理会话并进入登录页', async () => {
      const s = await session(browser, { signedIn: true, handle: async ({ endpoint, reply }) => {
        if (endpoint === '/getInfo') { await reply({ code: 401, msg: '账号会话已失效' }); return true }
        if (endpoint === '/logout') { await reply({ code: 500, msg: '退出服务暂不可用' }); return true }
        return false
      } })
      try {
        await s.page.goto(base + '/shipyard/workspace/workbench')
        await s.page.getByPlaceholder('账号', { exact: true }).waitFor()
        assert.equal(new URL(s.page.url()).pathname, '/login')
        assert.equal((await s.context.cookies()).some(c => c.name === 'Admin-Token'), false)
        assert.equal(s.requests.some(r => r.endpoint === '/shipyard/bootstrap'), false)
        assert.deepEqual(s.errors, []); assert.deepEqual(s.unexpected, [])
      } finally { await s.context.close() }
    })
    for (const code of [500, 401]) await check('登录后权限菜单返回' + code + '能回登录页重试而不是卡在空白页面', async () => {
      const s = await session(browser, { signedIn: true, handle: async ({ endpoint, reply }) => {
        if (endpoint === '/getRouters') { await reply({ code, msg: '权限菜单暂不可用，请重新登录' }); return true }
        return false
      } })
      try {
        await s.page.goto(base + '/shipyard/workspace/workbench')
        await s.page.getByPlaceholder('账号', { exact: true }).waitFor()
        assert.equal(new URL(s.page.url()).pathname, '/login')
        assert.equal(await s.page.locator('.el-message-box:visible').count(), 0, 'Login recovery should not leave a second relogin modal over the login page')
        assert.equal((await s.context.cookies()).some(c => c.name === 'Admin-Token'), false)
        assert.equal(s.requests.some(r => r.endpoint === '/shipyard/bootstrap'), false)
        assert.deepEqual(s.errors, []); assert.deepEqual(s.unexpected, [])
      } finally { await s.context.close() }
    })
    for (const failedEndpoint of ['/getInfo', '/getRouters']) await check('输入登录成功但' + failedEndpoint + '失败后结束加载、更新验证码并能重新登录', async () => {
      let failures = 0, captchas = 0
      const s = await session(browser, { handle: async ({ endpoint, reply }) => {
        if (endpoint === '/captchaImage') { await reply({ code: 200, captchaEnabled: true, uuid: 'retry-challenge-' + ++captchas, img: png }); return true }
        if (endpoint === failedEndpoint && failures++ === 0) { await reply({ code: 500, msg: '首次登录资料暂不可用，请重试' }); return true }
        return false
      } })
      try {
        await s.page.goto(base + '/login'); await fillLogin(s.page)
        const loggedOut = s.page.waitForResponse(r => r.url().endsWith('/logout')); loggedOut.catch(() => {})
        await s.page.getByRole('button', { name: '登 录', exact: true }).click(); await loggedOut
        await s.page.waitForURL(url => url.pathname === '/login' && url.searchParams.has('redirect'))
        const submit = s.page.getByRole('button', { name: '登 录', exact: true })
        await submit.waitFor()
        await s.page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === '登 录' && !b.disabled))
        assert.equal(captchas, 2, 'The consumed captcha must be refreshed after the login route is restored')
        assert.equal((await s.context.cookies()).some(c => c.name === 'Admin-Token'), false)
        await fillLogin(s.page); await submit.click()
        await s.page.getByRole('heading', { name: '待处理事项', exact: true }).waitFor()
        assert.equal(s.requests.filter(r => r.endpoint === '/login').length, 2)
        assert.deepEqual(s.errors, []); assert.deepEqual(s.unexpected, [])
      } finally { await s.context.close() }
    })
    for (const target of [
      { name: '用工', grant: 'work:submit', section: 'workbench', button: '新增用工' },
      { name: '基础资料', grant: 'master:edit', section: 'projects', button: '新增工程' },
      { name: '其他收支', grant: 'ledger:edit', section: 'ledger', button: '登记收支' }
    ]) await check('后台刷新撤销权限后关闭已打开' + target.name + '表单，不能继续提交', async () => {
      const s = await session(browser, { signedIn: true })
      try {
        s.state.grants = ['shipyard:' + target.grant]
        await s.page.goto(base + '/shipyard/workspace/' + target.section)
        await s.page.getByRole('button', { name: target.button, exact: true }).click()
        const drawer = s.page.locator('.el-drawer:visible'); await drawer.waitFor()
        s.state.grants = []
        const fresh = s.page.waitForResponse(r => r.url().endsWith('/shipyard/bootstrap'))
        await s.page.evaluate(() => window.dispatchEvent(new Event('focus'))); await fresh
        await s.page.waitForFunction(label => ![...document.querySelectorAll('button')].some(b => b.textContent.trim() === label), target.button)
        await drawer.waitFor({ state: 'hidden' })
        assert.equal(await drawer.count(), 0, 'Revoked submission permission must close the open creation form')
        assert.equal(s.requests.filter(r => r.endpoint.startsWith('/shipyard/') && r.method !== 'GET').length, 0)
        assert.deepEqual(s.errors, []); assert.deepEqual(s.unexpected, [])
      } finally { await s.context.close() }
    })
    await check('已打开业务页收到401后清理Cookie并返回登录页', async () => {
      let expired = false
      const s = await session(browser, { signedIn: true, handle: async ({ endpoint, reply }) => {
        if (endpoint === '/shipyard/bootstrap' && expired) { await reply({ code: 401, msg: '账号已停用或会话失效' }); return true }
        return false
      } })
      try {
        await s.page.goto(base + '/shipyard/workspace/workbench')
        await s.page.getByRole('heading', { name: '待处理事项', exact: true }).waitFor()
        expired = true; await s.page.getByRole('button', { name: '刷新数据', exact: true }).click()
        await s.page.getByPlaceholder('账号', { exact: true }).waitFor()
        assert.equal((await s.context.cookies()).some(c => c.name === 'Admin-Token'), false)
        assert.deepEqual(s.errors, []); assert.deepEqual(s.unexpected, [])
      } finally { await s.context.close() }
    })
  } finally { await browser.close() }
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ completed: !failed.length, testedAt: new Date().toISOString(), passed, failed, fixtureResponses: true, realBusinessWrites: 0 }, null, 2))
  if (failed.length) process.exitCode = 1
})().catch(error => { console.error(String(error.message).split('\n')[0]); process.exitCode = 1 })
