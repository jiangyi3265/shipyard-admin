const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('./playwright-runtime.cjs')
const base = process.env.PC_AUDIT_URL || 'http://127.0.0.1:5193'
const apiPrefix = process.env.PC_AUDIT_API_PREFIX || '/dev-api'
const clone = value => JSON.parse(JSON.stringify(value))
const passed = [], failed = [], errors = [], writes = []
const record = (id, areaId, area, note) => ({ id, projectId: 1, areaId, area, ship: '测试一号', kind: '用工', type: '包工', title: area + '包工', date: '2026-11-01', start: '2026-11-01', end: '2026-11-20', author: '测试组长', createdBy: 20, version: 1, status: '待审批', amount: 100, people: [31], lines: [{ name: '测试工人', amount: 100, rate: 30, hours: 0, multiplier: 1 }], note, files: [], audit: [] })
const fixture = {
  user: { id: 1, name: '测试管理员' }, roles: ['sy_admin', 'sy_owner'], grants: ['*:*:*'], serverDate: '2026-11-04',
  projects: [{ id: 1, name: '测试一号', title: '主甲板工程', price: 10000, area: 100, wages: 100, reimbursements: 20, otherCosts: 30 }, { id: 2, name: '测试二号', title: '轮机工程', price: 20000, area: 200 }],
  areas: [{ id: 11, projectId: 1, name: 'A 区', completedAt: '2026-11-02 10:00:00', area: 20, rate: 50, contract: 100, wages: 0, paid: false }, { id: 12, projectId: 1, name: 'A 区加装', completedAt: '2026-11-03 10:00:00', area: 20, rate: 50, contract: 100, wages: 0, paid: true }, { id: 13, projectId: 1, name: 'B 区', area: 60, rate: 50, contract: 0, wages: 0, status: '待开工' }],
  people: [{ id: 31, name: '测试工人', code: 'W31', team: '一班', rate: 30 }],
  records: [record('BG101', 11, 'A 区', '包工期限核对'), record('BG102', 12, 'A 区加装', '其他区域工作')],
  payroll: [], transactions: [], attendance: [{ projectId: 1, areaId: 11, date: '2026-11-04', workerId: 31, name: '测试工人', code: 'W31', team: '一班', hours: 8 }],
  notifications: [{ id: 201, recordId: 'BG101', title: '包工审批提醒', detail: '待处理', time: '2026-11-04 10:00:00', read: false }, { id: 202, recordId: 'BG102', title: '其他区域提醒', detail: '待处理', time: '2026-11-04 10:01:00', read: false }]
}
const accounts = {
  roles: ['管理员', '组长', '项目经理', '负责人', '会计', '安全员'].map((name, i) => ({ id: i + 1, name, key: ['sy_admin', 'sy_leader', 'sy_manager', 'sy_owner', 'sy_accountant', 'sy_safety'][i], permissions: ['shipyard:work:submit'] })),
  users: [{ id: 1, name: '测试管理员', username: 'admin', roleIds: [1, 4], projectIds: [], status: '0' }, { id: 20, name: '测试组长', username: 'leader', roleIds: [2], projectIds: [1], status: '0', wechatBound: false }, { id: 30, name: '双角色人员', username: 'dual', roleIds: [1, 4], projectIds: [], status: '0', wechatBound: true }],
  catalog: [{ key: 'shipyard:work:submit', name: '提交施工用工' }, { key: 'shipyard:expense:confirm', name: '负责人报销签字' }]
}
const registrations = [{ id: 301, name: '待审核人员', phone: '', note: '测试申请', status: 'pending', version: 1 }]
fixture.areas = fixture.areas.map(area => ({ ...area, id: String(area.id) }))
fixture.workerArchive = fixture.people.map(person => ({ ...person, active: 1 }))
fixture.records.push({ id: 'FK103', projectId: 1, areaId: 13, area: 'B 区', ship: '测试一号', kind: '罚款', title: '安全罚款', date: '2026-11-03', author: '测试安全员', createdBy: 40, version: 1, status: '已处理', amount: 20, person: 32, personSnapshot: { id: 32, name: '历史被罚人员', code: 'OLD32', team: '历史班组' }, note: '历史安全罚款', files: [], audit: [] })
fixture.records.push({ ...record('BG104', 13, 'B 区', '退回申请'), status: '已退回', createdBy: 1, allocations: { 31: 100 } })

async function test(name, action) {
  try { await action(); passed.push(name); console.log('PASS ' + name) }
  catch (error) { failed.push({ name, error: error.message }); console.log('FAIL ' + name + ': ' + error.message) }
}

async function run() {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
    await context.addCookies([{ name: 'Admin-Token', value: 'isolated-management-test', url: base }])
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== new URL(base).origin) return route.abort()
      if (!url.pathname.startsWith(apiPrefix + '/')) {
        if (/^\/(?:api|dev-api)\//.test(url.pathname) || !['GET', 'HEAD'].includes(route.request().method())) return route.abort()
        return route.continue()
      }
      const endpoint = url.pathname.slice(apiPrefix.length), method = route.request().method()
      let result
      if (method !== 'GET') writes.push({ endpoint, body: route.request().postDataJSON() })
      const body = method === 'GET' ? null : route.request().postDataJSON()
      if (endpoint === '/getInfo') result = { code: 200, user: { userId: fixture.user.id, userName: 'test', nickName: fixture.user.name }, roles: fixture.roles, permissions: fixture.grants }
      else if (endpoint === '/getRouters') result = { code: 200, data: [] }
      else if (endpoint === '/shipyard/bootstrap') result = { code: 200, data: fixture }
      else if (endpoint === '/shipyard/accounts' && method === 'GET') result = { code: 200, data: accounts }
      else if (endpoint === '/shipyard/accounts') { Object.assign(accounts.users.find(user => user.id === body.id), body); result = { code: 200 } }
      else if (endpoint === '/shipyard/wechat/registrations') result = { code: 200, data: registrations }
      else if (/^\/shipyard\/wechat\/registrations\/\d+\/review$/.test(endpoint)) {
        const row = registrations.find(row => row.id === Number(endpoint.split('/')[4]))
        Object.assign(row, { status: body.accept ? 'approved' : 'rejected', reason: body.reason, reviewer: '测试管理员', username: 'wx_test', version: row.version + 1 })
        result = { code: 200 }
      }
      else if (/^\/shipyard\/roles\/\d+\/permissions$/.test(endpoint)) { accounts.roles.find(role => role.id === Number(endpoint.split('/')[3])).permissions = body.permissions; result = { code: 200 } }
      else if (endpoint.startsWith('/shipyard/master/')) {
        const key = { project: 'projects', area: 'areas', person: 'workerArchive' }[endpoint.split('/').pop()]
        const existing = fixture[key].find(row => row.id === body.id)
        if (existing) Object.assign(existing, body); else fixture[key].push({ ...body, id: 99 })
        if (key === 'workerArchive') fixture.people = fixture.workerArchive.filter(person => Number(person.active ?? 1) === 1).map(clone)
        result = { code: 200 }
      }
      else if (endpoint.startsWith('/shipyard/records/')) result = { code: 200, data: fixture.records.find(row => row.id === endpoint.split('/').pop()) }
      else if (/^\/shipyard\/notices\/\d+\/read$/.test(endpoint)) { fixture.notifications.find(row => row.id === Number(endpoint.split('/')[3])).read = true; result = { code: 200 } }
      else throw new Error('Unexpected mocked API: ' + method + ' ' + endpoint)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
    })
    await page.goto(base + '/shipyard/workspace/workbench')
    await page.getByRole('heading', { name: '待处理事项', exact: true }).waitFor()
    const nav = async name => { await page.getByRole('navigation', { name: '船厂业务导航' }).getByRole('button', { name, exact: true }).click(); await page.getByRole('heading', { name, exact: true }).first().waitFor() }
    const visibleDrawer = () => page.locator('.el-drawer:visible')
    const refresh = async () => { await page.getByRole('button', { name: '刷新数据', exact: true }).click(); await page.locator('button.is-loading').filter({ hasText: '刷新数据' }).waitFor({ state: 'hidden' }) }
    const select = async (label, name) => { await page.locator('.el-select').filter({ has: page.getByRole('combobox', { name: label, exact: true }) }).click(); await page.getByRole('option', { name, exact: true }).click(); await page.keyboard.press('Escape') }

    await test('9 个一级模块与经营总览入口', async () => {
      assert.equal(await page.getByRole('navigation', { name: '船厂业务导航' }).getByRole('button').count(), 9)
      await page.getByText('预计毛利', { exact: true }).waitFor()
      for (const name of ['工程与人员', '申请与审批', '每日出勤', '工资结算', '收支台账', '完工归档', '账号权限', '消息', '工作台']) await nav(name)
    })
    await test('工程、区域、人员编辑保存并从 bootstrap 刷新', async () => {
      await nav('工程与人员')
      await page.locator('.el-table__body tr').filter({ hasText: '测试一号' }).getByRole('button', { name: '编辑工程' }).click()
      await visibleDrawer().getByRole('textbox', { name: '工程描述', exact: true }).fill('已核对工程描述')
      await visibleDrawer().getByRole('button', { name: '保存资料', exact: true }).click()
      await page.getByRole('cell', { name: '已核对工程描述', exact: true }).waitFor()
      await page.locator('.el-table__body tr').filter({ hasText: 'B 区' }).getByRole('button', { name: '编辑区域' }).click()
      await visibleDrawer().getByRole('spinbutton', { name: '结算单价', exact: true }).fill('55')
      await visibleDrawer().getByRole('button', { name: '保存资料', exact: true }).click()
      await visibleDrawer().waitFor({ state: 'hidden' })
      assert.equal(fixture.areas.find(row => String(row.id) === '13').rate, 55)
      await page.getByRole('button', { name: '编辑人员', exact: true }).click()
      await visibleDrawer().getByRole('textbox', { name: '班组', exact: true }).fill('二班')
      await visibleDrawer().getByRole('button', { name: '保存资料', exact: true }).click()
      await page.getByRole('cell', { name: '二班', exact: true }).waitFor()
      await page.getByRole('textbox', { name: '搜索人员', exact: true }).fill('二班')
      await page.getByRole('cell', { name: '测试工人', exact: true }).waitFor()
    })
    await test('人员停用/恢复需要确认，停用后保留档案与历史数据', async () => {
      const row = page.locator('.el-table__body tr').filter({ hasText: '测试工人' })
      await row.getByRole('button', { name: '停用人员', exact: true }).click()
      await page.locator('.el-message-box').getByRole('button', { name: '取消', exact: true }).click()
      assert.equal(fixture.people.length, 1)
      await row.getByRole('button', { name: '停用人员', exact: true }).click()
      await page.locator('.el-message-box').getByRole('button', { name: '确定', exact: true }).click()
      await row.getByRole('button', { name: '恢复人员', exact: true }).waitFor()
      assert.equal(fixture.people.length, 0)
      assert.equal(fixture.workerArchive[0].active, 0)
      assert.equal(fixture.records[0].lines[0].name, '测试工人')
      await row.getByRole('button', { name: '恢复人员', exact: true }).click()
      await page.locator('.el-message-box').getByRole('button', { name: '确定', exact: true }).click()
      await row.getByRole('button', { name: '停用人员', exact: true }).waitFor()
      assert.equal(fixture.people.length, 1)
    })
    await test('完工归档精确定位区域，不混入近似区域', async () => {
      await nav('完工归档')
      await page.locator('.el-table__body tr').filter({ has: page.getByRole('cell', { name: 'A 区', exact: true }) }).getByRole('button', { name: '查看施工记录' }).click()
      await page.getByRole('heading', { name: '业务申请与审批' }).waitFor()
      const rows = page.locator('.el-table__body tr')
      assert.equal(await rows.count(), 1)
      assert.match(await rows.first().innerText(), /包工期限核对/)
    })
    await test('包工审批详情显示完整工期', async () => {
      await nav('工作台')
      await page.locator('.el-table__body tr').filter({ hasText: 'A 区包工' }).getByRole('button', { name: '查看处理' }).click()
      try { assert.match(await visibleDrawer().innerText(), /2026-11-01\s*[—至]\s*2026-11-20/) }
      finally { await visibleDrawer().getByRole('button', { name: '关闭', exact: true }).click() }
    })
    await test('账号页顶部刷新同步手机端修改及新微信申请', async () => {
      await nav('账号权限')
      await page.getByRole('cell', { name: '测试组长', exact: true }).waitFor()
      accounts.users.find(user => user.id === 20).name = '手机修改的姓名'
      registrations.push({ id: 302, name: '新增微信申请', status: 'pending', version: 1, note: '', phone: '' })
      await refresh()
      await page.getByRole('cell', { name: '手机修改的姓名', exact: true }).waitFor()
      await page.getByRole('cell', { name: '新增微信申请', exact: true }).waitFor()
    })
    await test('账号双角色和全工程权限可查看及保存', async () => {
      await nav('工作台'); await nav('账号权限')
      const row = page.locator('.el-table__body tr').filter({ hasText: '双角色人员' })
      await row.getByRole('button', { name: '编辑权限' }).click()
      assert.equal(await visibleDrawer().getByRole('checkbox', { name: '管理员', exact: true }).isChecked(), true)
      assert.equal(await visibleDrawer().getByRole('checkbox', { name: '负责人', exact: true }).isChecked(), true)
      await visibleDrawer().getByRole('textbox', { name: '账号姓名', exact: true }).fill('双角色已确认')
      await visibleDrawer().getByRole('button', { name: '保存账号' }).click()
      await page.getByRole('cell', { name: '双角色已确认', exact: true }).waitFor()
      assert.deepEqual(accounts.users.find(user => user.id === 30).roleIds, [1, 4])
    })
    await test('微信审核必填校验、已有账号角色回填、双角色通过', async () => {
      const row = page.locator('.el-table__body tr').filter({ hasText: '待审核人员' })
      await row.getByRole('button', { name: '审核申请' }).click()
      await visibleDrawer().getByRole('button', { name: '通过并绑定微信' }).click()
      await visibleDrawer().getByText('请至少分配一个角色', { exact: true }).waitFor()
      await visibleDrawer().getByRole('button', { name: '拒绝申请' }).click()
      await visibleDrawer().getByText('请填写拒绝原因', { exact: true }).waitFor()
      await visibleDrawer().locator('.el-radio').filter({ hasText: '关联已有账号' }).click()
      await select('关联已有账号', '手机修改的姓名 · leader')
      assert.equal(await visibleDrawer().getByRole('checkbox', { name: '组长', exact: true }).isChecked(), true)
      await visibleDrawer().locator('.el-radio').filter({ hasText: '新建业务账号' }).click()
      await visibleDrawer().locator('.el-checkbox').filter({ hasText: '管理员' }).click()
      await visibleDrawer().locator('.el-checkbox').filter({ hasText: '负责人' }).click()
      await visibleDrawer().getByRole('button', { name: '通过并绑定微信' }).click()
      await visibleDrawer().waitFor({ state: 'hidden' })
      const sent = writes.filter(write => write.endpoint === '/shipyard/wechat/registrations/301/review').pop()
      assert.deepEqual(sent.body.roleIds, [1, 4]); assert.equal(sent.body.version, 1); assert.equal(sent.body.accept, true)
    })
    await test('角色操作权限配置提交', async () => {
      const row = page.locator('.el-table__body tr').filter({ has: page.getByRole('cell', { name: '负责人', exact: true }) })
      await row.getByRole('button', { name: '配置权限' }).click()
      await visibleDrawer().locator('.el-checkbox').filter({ hasText: '负责人报销签字' }).click()
      await visibleDrawer().getByRole('button', { name: '保存角色权限' }).click()
      await visibleDrawer().waitFor({ state: 'hidden' })
      assert.equal(accounts.roles.find(role => role.id === 4).permissions.includes('shipyard:expense:confirm'), true)
    })
    await test('消息打开正确单据并同步已读状态', async () => {
      await nav('消息')
      await page.locator('.el-table__body tr').filter({ hasText: '包工审批提醒' }).getByRole('button', { name: '查看单据' }).click()
      await visibleDrawer().getByText('包工期限核对', { exact: true }).waitFor()
      await visibleDrawer().getByRole('button', { name: '关闭', exact: true }).click()
      assert.equal(fixture.notifications[0].read, true)
    })
    await test('消息全部已读入口与剩余消息同步', async () => {
      const button = page.getByRole('button', { name: '全部已读', exact: true })
      assert.equal(await button.count(), 1)
      await button.click()
      await page.getByText('已全部标为已读', { exact: true }).waitFor()
      assert.equal(fixture.notifications.every(notice => notice.read), true)
    })
    await test('四类数据导出入口可生成文件', async () => {
      for (const [section, label] of [['申请与审批', '导出申请'], ['每日出勤', '导出出勤'], ['工资结算', '导出工资明细'], ['收支台账', '导出台账']]) {
        await nav(section)
        const download = page.waitForEvent('download')
        await page.getByRole('button', { name: label, exact: true }).click()
        assert.match((await download).suggestedFilename(), /\.csv$/)
      }
    })
    await test('历史罚款展示及导出使用人员快照', async () => {
      await nav('申请与审批')
      await select('工作区域筛选', '全部区域')
      await select('申请类型', '全部类型')
      await page.getByRole('textbox', { name: '搜索申请', exact: true }).fill('FK103')
      await page.getByRole('button', { name: '查看详情', exact: true }).click()
      await visibleDrawer().getByText('历史被罚人员', { exact: true }).waitFor()
      await visibleDrawer().getByRole('button', { name: '关闭', exact: true }).click()
      const downloaded = page.waitForEvent('download')
      await page.getByRole('button', { name: '导出申请', exact: true }).click()
      const stream = await (await downloaded).createReadStream(), chunks = []
      for await (const chunk of stream) chunks.push(chunk)
      const csv = Buffer.concat(chunks).toString('utf8')
      assert.match(csv, /历史被罚人员/); assert.match(csv, /OLD32/); assert.match(csv, /历史班组/)
    })
    await test('编辑草稿不混入新增申请，同版本编辑可恢复草稿', async () => {
      await page.getByRole('textbox', { name: '搜索申请', exact: true }).fill('BG104')
      await page.getByRole('button', { name: '查看详情', exact: true }).click()
      await visibleDrawer().getByRole('button', { name: '修改并重新提交', exact: true }).click()
      assert.match(await visibleDrawer().locator('.el-select').filter({ has: page.getByRole('combobox', { name: '工作区域', exact: true }) }).innerText(), /B 区/)
      await visibleDrawer().getByRole('textbox', { name: '申请说明', exact: true }).fill('修改草稿内容')
      await visibleDrawer().getByRole('button', { name: '存草稿', exact: true }).click()
      await visibleDrawer().getByRole('button', { name: '取消', exact: true }).click()
      await page.getByRole('button', { name: '新增用工', exact: true }).click()
      try {
        assert.equal(await visibleDrawer().getByText('新增用工申请', { exact: true }).count(), 1)
        assert.equal(await visibleDrawer().getByRole('textbox', { name: '申请说明', exact: true }).inputValue(), '')
      } finally { await visibleDrawer().getByRole('button', { name: '取消', exact: true }).click() }
      await page.getByRole('button', { name: '查看详情', exact: true }).click()
      await visibleDrawer().getByRole('button', { name: '修改并重新提交', exact: true }).click()
      assert.equal(await visibleDrawer().getByRole('textbox', { name: '申请说明', exact: true }).inputValue(), '修改草稿内容')
      await visibleDrawer().getByRole('button', { name: '取消', exact: true }).click()
      Object.assign(fixture.records.find(row => row.id === 'BG104'), { version: 2, note: '服务器新版本说明' })
      await refresh()
      await page.getByRole('button', { name: '查看详情', exact: true }).click()
      await visibleDrawer().getByRole('button', { name: '修改并重新提交', exact: true }).click()
      assert.equal(await visibleDrawer().getByRole('textbox', { name: '申请说明', exact: true }).inputValue(), '服务器新版本说明')
      await visibleDrawer().getByRole('button', { name: '取消', exact: true }).click()
    })
    await test('新建草稿按工程隔离，返回原工程可恢复', async () => {
      await page.getByRole('button', { name: '新增用工', exact: true }).click()
      await visibleDrawer().getByRole('textbox', { name: '申请说明', exact: true }).fill('一号工程草稿')
      await visibleDrawer().getByRole('button', { name: '存草稿', exact: true }).click()
      await visibleDrawer().getByRole('button', { name: '取消', exact: true }).click()
      await select('当前工程', '测试二号')
      await page.getByRole('button', { name: '新增用工', exact: true }).click()
      try { assert.equal(await visibleDrawer().getByRole('textbox', { name: '申请说明', exact: true }).inputValue(), '') }
      finally { await visibleDrawer().getByRole('button', { name: '取消', exact: true }).click() }
      await select('当前工程', '测试一号')
      await page.getByRole('button', { name: '新增用工', exact: true }).click()
      assert.equal(await visibleDrawer().getByRole('textbox', { name: '申请说明', exact: true }).inputValue(), '一号工程草稿')
      await visibleDrawer().getByRole('button', { name: '取消', exact: true }).click()
    })
    await test('组长入口按授权收敛，强行访问账号页返回工作台', async () => {
      fixture.user = { id: 20, name: '测试组长' }; fixture.roles = ['sy_leader']; fixture.grants = ['shipyard:work:submit', 'shipyard:expense:submit']
      await page.goto(base + '/shipyard/workspace/accounts')
      await page.getByRole('heading', { name: '待处理事项', exact: true }).waitFor()
      assert.equal(await page.getByRole('navigation', { name: '船厂业务导航' }).getByRole('button', { name: '账号权限', exact: true }).count(), 0)
      assert.equal(page.url().endsWith('/workbench'), true)
    })
    await test('六角色入口及申请按钮按授权显示，非管理员仍可查看在职人员', async () => {
      const fullArchive = clone(fixture.workerArchive)
      const profiles = [
        ['sy_admin', ['*:*:*'], 9, ['新增用工', '申请报销', '登记罚款']],
        ['sy_leader', ['work:submit', 'expense:submit'], 5, ['新增用工', '申请报销']],
        ['sy_manager', ['work:approve', 'work:complete', 'expense:submit', 'expense:approve', 'fine:approve'], 5, ['申请报销']],
        ['sy_owner', ['expense:confirm', 'finance:view'], 8, []],
        ['sy_accountant', ['expense:pay', 'fine:handle', 'payroll:pay', 'finance:view', 'ledger:edit'], 8, []],
        ['sy_safety', ['fine:submit', 'expense:submit'], 5, ['申请报销', '登记罚款']]
      ]
      for (const [role, grants, tabCount, actions] of profiles) {
        fixture.roles = [role]; fixture.grants = grants.map(grant => grant === '*:*:*' ? grant : 'shipyard:' + grant)
        fixture.workerArchive = role === 'sy_admin' ? fullArchive : []
        await page.goto(base + '/shipyard/workspace/workbench')
        await page.getByRole('heading', { name: '待处理事项', exact: true }).waitFor()
        assert.equal(await page.getByRole('navigation', { name: '船厂业务导航' }).getByRole('button').count(), tabCount, role)
        for (const action of ['新增用工', '申请报销', '登记罚款']) assert.equal(await page.getByRole('button', { name: action, exact: true }).count(), actions.includes(action) ? 1 : 0, role + ':' + action)
        await nav('工程与人员')
        await page.getByRole('cell', { name: '测试工人', exact: true }).waitFor()
        if (role !== 'sy_admin') assert.equal(await page.getByRole('button', { name: '停用人员', exact: true }).count(), 0)
      }
    })
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
  const output = path.resolve(__dirname, '../artifacts/management-coverage')
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed, failed, errors, isolatedFixtures: true, base, apiPrefix, stringAreaIds: true, testedAt: new Date().toISOString() }, null, 2))
  if (failed.length) process.exitCode = 1
}
run().catch(error => { console.error(error); process.exitCode = 1 })
