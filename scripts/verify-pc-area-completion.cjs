// Real UI against the dedicated local test backend only. No production endpoints.
const { chromium } = require('./playwright-runtime.cjs')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), { execFileSync } = require('node:child_process')
const credentials = require('./test-credentials.cjs').load()
const baseUrl = new URL(process.env.SHIPYARD_ADMIN_BASE || 'http://127.0.0.1:5197')
assert.ok(['127.0.0.1', 'localhost'].includes(baseUrl.hostname), 'PC completion test only allows loopback hosts')
assert.ok(['http:', 'https:'].includes(baseUrl.protocol) && !baseUrl.username && !baseUrl.password && baseUrl.pathname === '/' && !baseUrl.search && !baseUrl.hash, 'PC completion test requires a plain local origin')
const base = baseUrl.origin, apiPrefix = '/dev-api'
const out = path.resolve(__dirname, '../artifacts/pc-completion-1105'); fs.mkdirSync(out, { recursive: true })
const run = Date.now().toString().slice(-9), areaName = 'PC完工区域' + run, workerName = 'PC名单工人' + run, workerCode = 'PCW' + run
const passed = [], errors = [], blocked = [], states = new Map(), fixtures = {}, writes = []
let browser, stage = '初始化'
const report = name => { passed.push(name); console.log('PASS ' + name); fs.writeFileSync(path.join(out, 'progress.json'), JSON.stringify({ completed: false, stage, passed, fixtures }, null, 2)) }
function response(page, endpoint, method = 'POST') {
  const wait = page.waitForResponse(r => new URL(r.url()).pathname === apiPrefix + endpoint && r.request().method() === method, { timeout: 20000 })
  wait.catch(() => {}); return wait
}
async function data(wait, expected = 200) { const result = await (await wait).json(); assert.equal(result.code, expected, result.msg); return result.data ?? result }
const drawer = page => page.locator('.el-drawer:visible')
const row = page => page.locator('.el-table__body tr').filter({ hasText: areaName })
async function tab(page, label) { await page.getByRole('navigation', { name: '船厂业务导航' }).getByRole('button', { name: label, exact: true }).click() }
async function refresh(page) { const wait = response(page, '/shipyard/bootstrap', 'GET'); await page.getByRole('button', { name: '刷新数据', exact: true }).click(); const value = await data(wait); await page.locator('button.is-loading').filter({ hasText: '刷新数据' }).waitFor({ state: 'hidden' }); return value }
async function select(page, label, name) { await drawer(page).locator('.el-select').filter({ has: page.getByRole('combobox', { name: label, exact: true }) }).click(); await page.getByRole('option', { name, exact: true }).click(); await page.keyboard.press('Escape') }
async function close(page) { await drawer(page).locator('.el-drawer__footer').getByRole('button', { name: /^(取消|关闭)$/ }).click(); await drawer(page).waitFor({ state: 'hidden' }) }
async function confirm(page) { await page.locator('.el-message-box').getByRole('button', { name: '确定', exact: true }).click() }
async function login(username) {
  stage = '登录 ' + username; console.log('CHECK ' + stage)
  const context = await browser.newContext({ viewport: { width: 1560, height: 1100 } })
  await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin !== base) { blocked.push(url.origin + url.pathname); return route.abort() } return route.continue() })
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message))
  page.on('response', async r => { if (new URL(r.url()).pathname === apiPrefix + '/shipyard/bootstrap') { const value = await r.json().catch(() => null); if (value?.code === 200) states.set(page, value.data) } })
  page.on('request', r => { if (r.method() !== 'GET' && new URL(r.url()).pathname.startsWith(apiPrefix + '/shipyard/')) writes.push({ username, path: new URL(r.url()).pathname, method: r.method() }) })
  const captcha = response(page, '/captchaImage', 'GET'); await page.goto(base + '/login', { waitUntil: 'networkidle' })
  const challenge = await (await captcha).json()
  const code = JSON.parse(execFileSync('redis-cli', ['-h', '127.0.0.1', '-p', '6383', '-n', '1', '--raw', 'GET', 'captcha_codes:' + challenge.uuid], { encoding: 'utf8', windowsHide: true, timeout: 10000 }))
  assert.ok(code, 'Captcha must come from isolated Redis 6383 DB 1')
  await page.getByPlaceholder('账号', { exact: true }).fill(username); await page.getByPlaceholder('密码', { exact: true }).fill(credentials.password)
  await page.getByPlaceholder('验证码', { exact: true }).fill(String(code)); await page.getByPlaceholder('验证码', { exact: true }).press('Tab')
  const signed = response(page, '/login'); await page.getByRole('button', { name: '登 录', exact: true }).click(); await data(signed)
  await page.getByRole('heading', { name: '待处理事项', exact: true }).waitFor(); await refresh(page); return page
}
async function requestCompletion(page) { await tab(page, '工程与人员'); const wait = response(page, '/shipyard/areas/' + fixtures.areaId + '/completion-request'); await row(page).getByRole('button', { name: '提交完工', exact: true }).click(); await confirm(page); await data(wait); await row(page).getByRole('cell').filter({ hasText: '待确认完工' }).waitFor() }
;(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) })
  const admin = await login('admin'); await tab(admin, '工程与人员')
  stage = '新建区域与人员'
  await admin.getByRole('button', { name: '新增区域', exact: true }).click()
  await drawer(admin).getByRole('textbox', { name: '名称', exact: true }).fill(areaName)
  await drawer(admin).getByRole('spinbutton', { name: '面积', exact: true }).fill('100'); await drawer(admin).getByRole('spinbutton', { name: '结算单价', exact: true }).fill('10')
  let wait = response(admin, '/shipyard/master/area', 'PUT'); await drawer(admin).getByRole('button', { name: '保存资料', exact: true }).click(); await data(wait); await drawer(admin).waitFor({ state: 'hidden' })
  let state = await refresh(admin); const area = state.areas.find(a => a.name === areaName); assert.ok(area); fixtures.areaId = area.id; fixtures.projectId = area.projectId; fixtures.areaName = areaName
  assert.equal(area.status, '未开工'); assert.deepEqual(area.workers, []); await row(admin).getByText('未开工', { exact: true }).waitFor(); assert.equal(await row(admin).getByRole('button', { name: '确认完工' }).count(), 0)
  report('新区域真实保存并显示未开工、空施工名单，不提供无效确认完工按钮')
  await admin.getByRole('button', { name: '新增人员', exact: true }).click()
  for (const [label, value] of [['名称', workerName], ['工号', workerCode], ['班组', 'PC闭环验证']]) await drawer(admin).getByRole('textbox', { name: label, exact: true }).fill(value)
  await drawer(admin).getByRole('spinbutton', { name: '小时工资', exact: true }).fill('35.35')
  wait = response(admin, '/shipyard/master/person', 'PUT'); await drawer(admin).getByRole('button', { name: '保存资料', exact: true }).click(); await data(wait); await drawer(admin).waitFor({ state: 'hidden' })
  state = await refresh(admin); fixtures.workerId = state.people.find(p => p.code === workerCode).id
  const leader = await login('sy_leader'), manager = await login('sy_manager')
  stage = '组长用工与施工人员名单'
  await tab(leader, '申请与审批'); await leader.getByRole('button', { name: '新增用工', exact: true }).click()
  await select(leader, '工作区域', areaName); await select(leader, '工作人员', workerName + ' · ' + workerCode)
  await drawer(leader).getByRole('spinbutton', { name: '承包总价', exact: true }).fill('88.88')
  await drawer(leader).getByRole('spinbutton', { name: workerName + '分配金额', exact: true }).fill('88.88')
  await drawer(leader).getByRole('textbox', { name: '申请说明', exact: true }).fill('PC完工闭环 ' + run)
  wait = response(leader, '/shipyard/records'); await drawer(leader).getByRole('button', { name: '提交审批', exact: true }).click(); const record = await data(wait); fixtures.recordId = record.id
  await drawer(leader).locator('.record-heading').waitFor(); await close(leader); await tab(leader, '工程与人员'); await row(leader).getByText(workerName, { exact: true }).waitFor(); await row(leader).getByText('进行中', { exact: true }).waitFor()
  state = await refresh(manager); assert.equal(state.areas.find(a => String(a.id) === String(area.id)).workers[0].name, workerName)
  report('管理员新增人员可被组长选用，提交后区域进行中且组长/经理名单读取相同姓名')
  wait = response(leader, '/shipyard/areas/' + area.id + '/completion-request'); await row(leader).getByRole('button', { name: '提交完工', exact: true }).click(); await confirm(leader); await data(wait, 400)
  await leader.locator('.el-message--error').filter({ hasText: '待审批' }).waitFor(); report('待审批用工阻止提交完工并明确反馈错误')
  stage = '经理审批、组长申请完工'
  await tab(manager, '申请与审批'); await manager.getByRole('textbox', { name: '搜索申请', exact: true }).fill(record.id); await manager.getByRole('button', { name: '查看详情', exact: true }).click()
  wait = response(manager, '/shipyard/records/' + record.id + '/review'); await drawer(manager).getByRole('button', { name: '审批通过', exact: true }).click(); await data(wait); await drawer(manager).locator('.record-heading').getByText('待结算', { exact: true }).waitFor(); await close(manager)
  await refresh(leader); await requestCompletion(leader); state = await refresh(manager); const pending = state.areas.find(a => String(a.id) === String(area.id)); assert.equal(pending.status, '待确认完工'); assert.ok(pending.completionRequestedAt); assert.ok(pending.completionRequester)
  report('经理审批后组长提交完工，经理端同步申请人、时间和待确认状态')
  stage = '待确认区域新增用工限制'
  await tab(leader, '申请与审批'); await leader.getByRole('button', { name: '新增用工', exact: true }).click(); await drawer(leader).locator('.el-select').filter({ has: leader.getByRole('combobox', { name: '工作区域', exact: true }) }).click()
  assert.equal(await leader.getByRole('option', { name: areaName, exact: true }).count(), 0); await leader.keyboard.press('Escape'); await close(leader)
  report('待确认完工区域不再出现在新用工下拉中')
  stage = '经理退回完工'
  await tab(manager, '工程与人员'); await row(manager).getByRole('button', { name: '退回完工', exact: true }).click(); const box = manager.locator('.el-message-box')
  const beforeReject = writes.filter(w => w.path.endsWith('/completion-reject')).length
  await confirm(manager); await box.getByText('请填写退回原因，不超过200字', { exact: true }).waitFor(); assert.equal(writes.filter(w => w.path.endsWith('/completion-reject')).length, beforeReject)
  await box.getByRole('textbox').fill('甲板边角待收尾 ' + run); wait = response(manager, '/shipyard/areas/' + area.id + '/completion-reject'); await confirm(manager); await data(wait); await row(manager).getByText('进行中', { exact: true }).waitFor()
  state = await refresh(leader); assert.ok(state.notifications.some(n => n.title === '完工退回' && n.detail.includes(run)))
  await tab(leader, '消息'); await leader.getByRole('cell', { name: '甲板边角待收尾 ' + run, exact: true }).waitFor()
  report('经理退回原因必填，退回后区域恢复进行中且组长收到具体原因')
  stage = '重新申请并确认归档'
  await requestCompletion(leader); await refresh(manager); await tab(manager, '工程与人员')
  wait = response(manager, '/shipyard/areas/' + area.id + '/complete'); await row(manager).getByRole('button', { name: '确认完工', exact: true }).click(); await confirm(manager); await data(wait); await row(manager).getByText('已完工', { exact: true }).waitFor()
  state = await refresh(leader); assert.ok(state.areas.find(a => String(a.id) === String(area.id)).completedAt); assert.equal(state.records.find(r => r.id === record.id).status, '待结算')
  await tab(manager, '完工归档'); await manager.getByRole('cell', { name: areaName, exact: true }).waitFor(); await manager.screenshot({ path: path.join(out, 'manager-archive.png'), fullPage: true })
  await tab(leader, '工程与人员'); await row(leader).getByText('已完工', { exact: true }).waitFor(); assert.equal(await row(leader).getByRole('button', { name: '提交完工' }).count(), 0)
  await leader.screenshot({ path: path.join(out, 'leader-completed.png'), fullPage: true }); report('重新申请后经理确认，双端已完工与归档同步，工资仍保持待结算')
  assert.deepEqual(errors, []); assert.deepEqual(blocked, [])
  const result = { completed: true, testedAt: new Date().toISOString(), isolatedBackend: '127.0.0.1:8081', redis: '127.0.0.1:6383 DB 1', base, passed, fixtures, errors, blocked, businessWriteCount: writes.length }
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2))
})().catch(async error => {
  const message = require('./test-credentials.cjs').safeError(error)
  if (browser) for (const [index, context] of browser.contexts().entries()) for (const page of context.pages()) await page.screenshot({ path: path.join(out, 'failure-' + index + '.png'), fullPage: true }).catch(() => {})
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ completed: false, stage, message, passed, fixtures, errors, blocked }, null, 2)); console.error(stage + ': ' + message); process.exitCode = 1
}).finally(async () => { if (browser) await browser.close() })
