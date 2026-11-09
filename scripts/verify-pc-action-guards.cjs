// Browser regressions with intercepted API fixtures only. No real backend writes.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { chromium } = require('./playwright-runtime.cjs')
const base = process.env.PC_AUDIT_URL || 'http://127.0.0.1:5193'
const prefix = process.env.PC_AUDIT_API_PREFIX || '/dev-api'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname))
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2n8AAAAASUVORK5CYII='
const passed = [], failed = [], warnings = []
const output = path.resolve(__dirname, '../artifacts/action-guards')
fs.mkdirSync(output, { recursive: true })
const record = kind => ({ id: 'record-fixture', projectId: 1, areaId: 11, ship: '本地测试工程', area: '测试区域', kind,
  type: kind === '用工' ? '包工' : '', title: kind === '用工' ? '测试用工' : '测试报销', amount: 100,
  createdBy: 10, author: '测试用户', date: '2026-11-05', version: 1, status: '已退回', note: '本地测试说明', files: [], audit: [] })
const data = () => ({ user: { id: 10, name: '测试用户' }, roles: ['sy_owner'], grants: ['shipyard:finance:view'],
  serverDate: '2026-11-06', projects: [{ id: 1, name: '本地测试工程', title: '测试工程', price: 1000, area: 100 }],
  areas: [{ id: '11', projectId: 1, name: '测试区域', area: 100, rate: 10, status: '进行中' }],
  people: [], records: [], payroll: [], transactions: [], attendance: [], notifications: [] })
async function session(browser, fixture, extra = {}) {
  const errors = [], unexpected = [], writes = []
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addCookies([{ name: 'Admin-Token', value: 'local-action-fixture', url: base }])
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    const reply = result => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
    if (url.origin !== new URL(base).origin) { unexpected.push(url.origin); return route.abort() }
    if (!url.pathname.startsWith(prefix + '/')) {
      if (/^\/(?:api|dev-api|prod-api)\//.test(url.pathname) || !['GET', 'HEAD'].includes(request.method())) { unexpected.push(url.pathname); return route.abort() }
      return route.continue()
    }
    const endpoint = url.pathname.slice(prefix.length), method = request.method()
    if (method !== 'GET') writes.push(endpoint)
    if (extra.handle && await extra.handle({ endpoint, method, request, reply })) return
    if (endpoint === '/captchaImage') return reply({ code: 200, captchaEnabled: true, img: png, uuid: 'local-captcha' })
    if (endpoint === '/getInfo') return reply({ code: 200, user: { userId: 10, userName: 'test', nickName: '测试用户' }, roles: fixture.roles, permissions: fixture.grants })
    if (endpoint === '/getRouters') return reply({ code: 200, data: [] })
    if (endpoint === '/shipyard/bootstrap') return reply({ code: 200, data: fixture })
    if (endpoint === '/shipyard/records/record-fixture') return reply({ code: 200, data: fixture.records[0] })
    if (endpoint === '/shipyard/files' && method === 'POST') return reply({ code: 200, data: { id: 'file:local-proof' } })
    if (endpoint === '/shipyard/files/local-proof') return reply({ code: 200, data: 'data:image/png;base64,' + png })
    if (endpoint === '/shipyard/wechat/registrations') return reply({ code: 200, data: [] })
    if (endpoint === '/shipyard/accounts' && method === 'GET') return reply({ code: 200, data: {
      users: [{ id: 20, username: 'fixture', name: '本地账号', roleIds: [2], projectIds: [1], status: '0' }],
      roles: [{ id: 2, name: '组长', key: 'sy_leader', permissions: ['shipyard:work:submit'] }],
      catalog: [{ key: 'shipyard:work:submit', name: '提交用工' }]
    } })
    unexpected.push(method + ' ' + endpoint)
    return reply({ code: 503, msg: '未配置的测试请求已阻止' })
  })
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push('console: ' + message.text())
    if (message.type() === 'warning') warnings.push(message.text())
  })
  page.on('requestfailed', request => {
    const reason = request.failure()?.errorText || 'unknown failure'
    // Navigating to another tested page cancels superseded requests normally.
    if (reason !== 'net::ERR_ABORTED') errors.push('request: ' + new URL(request.url()).pathname + ' ' + reason)
  })
  page.setDefaultTimeout(7000)
  return { page, context, writes, errors, unexpected }
}
async function test(name, action) {
  try { await action(); passed.push(name); console.log('PASS ' + name) }
  catch (error) { failed.push({ name, message: String(error.message).split('\n')[0] }); console.log('FAIL ' + name + ': ' + String(error.message).split('\n')[0]) }
}
;(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) })
  try {
    await test('退回单只有仍有对应提交权限的本人可见重新提交按钮', async () => {
      const fixture = data(); fixture.records = [record('用工')]
      const s = await session(browser, fixture)
      try {
        await s.page.goto(base + '/shipyard/workspace/records')
        await s.page.getByRole('button', { name: '查看详情', exact: true }).click()
        const drawer = s.page.locator('.el-drawer:visible')
        await drawer.waitFor()
        assert.equal(await drawer.getByRole('button', { name: '修改并重新提交', exact: true }).count(), 0)
        assert.deepEqual(s.writes, []); assert.deepEqual(s.errors, []); assert.deepEqual(s.unexpected, [])
      } finally { await s.context.close() }
    })
    await test('重载已变化报销后必须重新核对付款凭证与付款信息', async () => {
      const fixture = data(); fixture.grants = ['shipyard:expense:pay']; fixture.roles = ['sy_accountant']
      fixture.records = [{ ...record('报销'), createdBy: 20, status: '待付款', ownerSigned: true }]
      const s = await session(browser, fixture)
      try {
        await s.page.goto(base + '/shipyard/workspace/records')
        await s.page.getByRole('button', { name: '查看详情', exact: true }).click()
        const drawer = s.page.locator('.el-drawer:visible'), pay = drawer.getByRole('button', { name: '确认已付款', exact: true })
        await drawer.getByLabel('上传付款凭证').setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
        await s.page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('确认已付款') && !b.disabled))
        await drawer.getByRole('combobox', { name: '付款日期', exact: true }).fill('2026-11-01').catch(async () => {
          await drawer.getByLabel('付款日期', { exact: true }).fill('2026-11-01')
        })
        await s.page.keyboard.press('Tab')
        fixture.records[0] = { ...fixture.records[0], version: 2, amount: 250 }
        await drawer.getByRole('button', { name: '刷新单据', exact: true }).click()
        await drawer.getByText('¥250.00', { exact: true }).waitFor()
        assert.equal(await pay.isDisabled(), true, 'A proof prepared for the old version must not enable paying a reloaded amount')
        assert.equal(await drawer.getByLabel('付款日期', { exact: true }).inputValue(), '2026-11-06')
        assert.equal(s.writes.filter(p => p.endsWith('/payment')).length, 0)
        assert.deepEqual(s.errors, []); assert.deepEqual(s.unexpected, [])
      } finally { await s.context.close() }
    })
    for (const roleMode of [false, true]) await test((roleMode ? '角色权限' : '账号') + '保存中关闭抽屉不会丢弃当前提交界面', async () => {
      const fixture = data(); fixture.grants = ['*:*:*']; fixture.roles = ['sy_admin']
      let release, started
      const pending = new Promise(resolve => { release = resolve }), received = new Promise(resolve => { started = resolve })
      const s = await session(browser, fixture, { handle: async ({ endpoint, method, reply }) => {
        if (method === 'PUT' && (endpoint === '/shipyard/accounts' || endpoint === '/shipyard/roles/2/permissions')) {
          started(); await pending; await reply({ code: 200 }); return true
        }
        return false
      } })
      try {
        await s.page.goto(base + '/shipyard/workspace/accounts')
        await s.page.getByRole('button', { name: roleMode ? '配置权限' : '编辑权限', exact: true }).click()
        const drawer = s.page.locator('.el-drawer:visible')
        await drawer.getByRole('button', { name: roleMode ? '保存角色权限' : '保存账号', exact: true }).click()
        await received
        await drawer.locator('.el-drawer__close-btn').click()
        await s.page.waitForTimeout(350)
        assert.equal(await drawer.isVisible(), true)
        release()
        await drawer.waitFor({ state: 'hidden' })
        assert.equal(s.writes.filter(p => p === '/shipyard/accounts' || p.includes('/permissions')).length, 1)
        assert.deepEqual(s.errors, []); assert.deepEqual(s.unexpected, [])
      } finally { release(); await s.context.close() }
    })
    await test('付款凭证校验、上传失败重试、取消付款和状态冲突均不会错误付款', async () => {
      const fixture = data(); fixture.grants = ['shipyard:expense:pay']; fixture.roles = ['sy_accountant']
      fixture.records = [{ ...record('报销'), createdBy: 20, status: '待付款' }]
      let uploadAttempts = 0
      const s = await session(browser, fixture, { handle: async ({ endpoint, method, reply }) => {
        if (endpoint === '/shipyard/files' && method === 'POST' && ++uploadAttempts === 1) {
          await reply({ code: 503, msg: '凭证上传失败，请重试' }); return true
        }
        if (endpoint.endsWith('/payment')) { await reply({ code: 409, msg: '单据状态已改变，请刷新后操作' }); return true }
        return false
      } })
      try {
        await s.page.goto(base + '/shipyard/workspace/records')
        await s.page.getByRole('button', { name: '查看详情', exact: true }).click()
        const drawer = s.page.locator('.el-drawer:visible'), upload = drawer.getByLabel('上传付款凭证'), pay = drawer.getByRole('button', { name: '确认已付款', exact: true })
        await upload.setInputFiles({ name: 'not-image.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid fixture') })
        await drawer.getByText('请选择不超过 5 MB 的 PNG 或 JPEG 图片', { exact: true }).waitFor()
        assert.equal(s.writes.length, 0); assert.equal(await pay.isDisabled(), true)
        await upload.setInputFiles({ name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) })
        assert.equal(s.writes.length, 0); assert.equal(await pay.isDisabled(), true)
        const image = { name: 'proof.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }
        await upload.setInputFiles(image)
        await drawer.getByText('凭证上传失败，请重试', { exact: true }).waitFor()
        assert.equal(await pay.isDisabled(), true)
        await upload.setInputFiles(image)
        await s.page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('确认已付款') && !b.disabled))
        await pay.click(); await s.page.locator('.el-message-box').getByRole('button', { name: '取消', exact: true }).click()
        assert.equal(s.writes.filter(x => x.endsWith('/payment')).length, 0)
        await pay.click(); await s.page.locator('.el-message-box').getByRole('button', { name: '确定', exact: true }).click()
        await drawer.getByText('单据状态已改变，请刷新后操作', { exact: true }).waitFor()
        assert.equal(s.writes.filter(x => x.endsWith('/payment')).length, 1)
        fixture.records[0] = { ...fixture.records[0], status: '已付款', version: 2 }
        await drawer.getByRole('button', { name: '刷新单据', exact: true }).click()
        await drawer.locator('.el-tag').getByText('已付款', { exact: true }).waitFor()
        assert.equal(await pay.count(), 0)
        assert.deepEqual(s.errors, []); assert.deepEqual(s.unexpected, [])
      } finally { await s.context.close() }
    })
    await test('微信注册审核失败保留角色选择，重试时仅提交一次且不能误关抽屉', async () => {
      const fixture = data(); fixture.grants = ['*:*:*']; fixture.roles = ['sy_admin']
      const registrations = [{ id: 301, name: '隔离审核申请人', status: 'pending', version: 1 }]
      let attempts = 0, release, started
      const pending = new Promise(resolve => { release = resolve }), received = new Promise(resolve => { started = resolve })
      const s = await session(browser, fixture, { handle: async ({ endpoint, method, request, reply }) => {
        if (endpoint === '/shipyard/wechat/registrations') { await reply({ code: 200, data: registrations }); return true }
        if (endpoint === '/shipyard/wechat/registrations/301/review' && method === 'POST') {
          const body = request.postDataJSON(); assert.deepEqual(body.roleIds, [2]); assert.equal(body.version, 1)
          if (++attempts === 1) { await reply({ code: 503, msg: '审核服务暂不可用，请重试' }); return true }
          started(); await pending; registrations[0].status = 'approved'; await reply({ code: 200 }); return true
        }
        return false
      } })
      try {
        await s.page.goto(base + '/shipyard/workspace/accounts')
        await s.page.getByRole('button', { name: '审核申请', exact: true }).click()
        const drawer = s.page.locator('.el-drawer:visible'), accept = drawer.getByRole('button', { name: '通过并绑定微信', exact: true })
        await drawer.locator('.el-checkbox').filter({ hasText: '组长' }).click()
        await drawer.locator('.el-checkbox').filter({ hasText: '本地测试工程' }).click()
        await accept.click(); await drawer.getByText('审核服务暂不可用，请重试', { exact: true }).waitFor()
        assert.equal(await drawer.getByRole('checkbox', { name: '组长', exact: true }).isChecked(), true)
        await accept.click(); await received
        await drawer.locator('.el-drawer__close-btn').click(); await s.page.keyboard.press('Escape')
        assert.equal(await drawer.isVisible(), true); assert.equal(attempts, 2)
        release(); await drawer.waitFor({ state: 'hidden' })
        await s.page.getByText('待审核 0', { exact: true }).waitFor()
        assert.deepEqual(s.errors, []); assert.deepEqual(s.unexpected, [])
      } finally { release(); await s.context.close() }
    })
    for (const width of [375, 768, 1440]) await test(width + 'px 登录和九个后台入口可见、无整页横向溢出', async () => {
      const fixture = data(); fixture.grants = ['*:*:*']; fixture.roles = ['sy_admin']
      fixture.records = [record('用工')]
      const s = await session(browser, fixture)
      try {
        await s.page.setViewportSize({ width, height: 1000 })
        await s.context.clearCookies()
        await s.page.goto(base + '/login')
        await s.page.getByPlaceholder('账号', { exact: true }).waitFor()
        for (const label of ['账号', '密码', '验证码']) assert.equal(await s.page.getByPlaceholder(label, { exact: true }).isVisible(), true)
        await s.page.getByRole('button', { name: '登 录', exact: true }).click()
        await s.page.getByText('请输入您的账号', { exact: true }).waitFor()
        assert.equal(s.writes.length, 0, 'Empty login must not reach an API')
        await s.page.screenshot({ path: path.join(output, width + '-login.png'), fullPage: true })
        await s.context.addCookies([{ name: 'Admin-Token', value: 'local-action-fixture', url: base }])
        await s.page.goto(base + '/shipyard/workspace/workbench')
        const nav = s.page.getByRole('navigation', { name: '船厂业务导航' })
        const labels = ['工作台', '工程与人员', '申请与审批', '每日出勤', '工资结算', '收支台账', '完工归档', '账号权限', '消息']
        for (const [index, label] of labels.entries()) {
          await nav.getByRole('button', { name: label, exact: true }).click()
          await s.page.getByRole('heading', { name: label, exact: true }).first().waitFor()
          assert.equal(await nav.getByRole('button', { name: label, exact: true }).isVisible(), true)
          const overflow = await s.page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }))
          assert.ok(overflow.scroll <= overflow.width + 2, label + ' page overflow: ' + JSON.stringify(overflow))
          await s.page.screenshot({ path: path.join(output, width + '-' + index + '.png'), fullPage: true })
        }
        assert.deepEqual(s.errors, []); assert.deepEqual(s.unexpected, [])
      } finally { await s.context.close() }
    })
  } finally { await browser.close() }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed, failed, warnings, fixtureResponses: true, realBusinessWrites: 0 }, null, 2))
  if (failed.length) process.exitCode = 1
})().catch(error => { console.error(String(error.message).split('\n')[0]); process.exitCode = 1 })
