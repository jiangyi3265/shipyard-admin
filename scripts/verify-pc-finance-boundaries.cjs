const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { chromium } = require('./playwright-runtime.cjs')

// All API responses are local fixtures. This test never connects to the backend.
const base = process.env.PC_AUDIT_URL || 'http://127.0.0.1:5193'
const apiPrefix = process.env.PC_AUDIT_API_PREFIX || '/dev-api'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Only local fixture tests are allowed')
const root = path.resolve(__dirname, '..')

function checkCsv() {
  const source = fs.readFileSync(path.join(root, 'src/api/shipyard.js'), 'utf8')
  const implementation = source.slice(source.indexOf('export function exportCsv')).replace('export function', 'function')
  let csv
  const sandbox = {
    Blob: class { constructor(parts) { csv = parts.join('') } },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    document: { createElement: () => ({ click() {} }) },
    setTimeout() {}
  }
  vm.runInNewContext(implementation + '; globalThis.exportCsv = exportCsv', sandbox)
  for (const value of ['-1+1', '-2+3', '-1+SUM(1,2)', '=1+1', '+1+1', '@SUM(1,2)', '\t-12']) {
    sandbox.exportCsv('test', [[value]])
    assert.equal(csv, '\uFEFF"\'' + value + '"', 'Formula-like text must be exported as text: ' + value)
  }
  for (const value of [-12.34, '-12.34', '-.25', '-1e+2', 0, 80.25]) {
    sandbox.exportCsv('test', [[value]])
    assert.equal(csv, '\uFEFF"' + value + '"', 'Numeric amounts must remain numeric: ' + value)
  }
  console.log('PASS CSV formula-like text is neutralized; positive and negative amounts are preserved')
}

async function checkPayroll() {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addCookies([{ name: 'Admin-Token', value: 'isolated-finance-test', url: base }])
    const page = await context.newPage(), errors = [], settlements = []
    page.on('pageerror', error => errors.push(error.message))
    const fixture = {
      user: { id: 10, name: '隔离测试' }, roles: ['sy_accountant'],
      grants: ['shipyard:finance:view', 'shipyard:payroll:pay'],
      projects: [{ id: 1, name: '测试工程', price: 1000 }], areas: [], people: [], records: [],
      payroll: [{ id: 101, projectId: 1, month: '2026-11', name: '模拟工人', label: '点工', hours: 8, rate: 10, multiplier: 1, amount: 80, paid: false }],
      transactions: [], attendance: [], notifications: [], serverDate: '2026-11-04'
    }
    await page.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== new URL(base).origin) return route.abort()
      if (!url.pathname.startsWith(apiPrefix + '/')) {
        if (/^\/(api|dev-api|prod-api)\//.test(url.pathname)) throw new Error('Unexpected unmocked API prefix: ' + url.pathname)
        return route.continue()
      }
      const endpoint = url.pathname.slice(apiPrefix.length)
      let result
      if (endpoint === '/getInfo') result = { code: 200, user: { userId: 10, userName: 'test', nickName: '隔离测试' }, roles: fixture.roles, permissions: fixture.grants }
      else if (endpoint === '/getRouters') result = { code: 200, data: [] }
      else if (endpoint === '/shipyard/bootstrap') result = { code: 200, data: fixture }
      else if (endpoint === '/shipyard/files' && route.request().method() === 'POST') result = { code: 200, data: { id: 'file:1' } }
      else if (endpoint === '/shipyard/files/1') result = { code: 200, data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' }
      else if (endpoint === '/shipyard/payroll/settle') {
        settlements.push(route.request().postDataJSON())
        fixture.payroll[0].paid = true
        result = { code: 200, data: 80 }
      } else throw new Error('Unexpected mocked API: ' + endpoint)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
    })
    await page.goto(base + '/shipyard/workspace/payroll')
    const row = page.locator('.el-table__body tr').filter({ hasText: '模拟工人' })
    const settle = page.getByRole('button', { name: '确认工资结算', exact: true })
    const checked = () => page.locator('.el-table__body input[type=checkbox]:checked').count()
    const nav = name => page.getByRole('navigation', { name: '船厂业务导航' }).getByRole('button', { name, exact: true }).click()
    const refresh = async () => {
      await page.getByRole('button', { name: '刷新数据', exact: true }).click()
      await page.locator('button.is-loading').filter({ hasText: '刷新数据' }).waitFor({ state: 'hidden' })
    }
    await row.waitFor()
    await row.locator('.el-checkbox').click()
    assert.equal(await checked(), 1)
    await nav('收支台账')
    await nav('工资结算')
    await row.waitFor()
    assert.equal(await checked(), 0)
    assert.equal(await settle.isDisabled(), true)
    assert.match(await page.locator('.filters').innerText(), /选择合计 ¥0\.00/)
    assert.equal(settlements.length, 0)
    console.log('PASS returning to payroll clears invisible selections and disables settlement')

    await row.locator('.el-checkbox').click()
    fixture.payroll[0].paid = true
    await refresh()
    assert.equal(await checked(), 0)
    assert.equal(await settle.isDisabled(), true)
    console.log('PASS refresh removes a wage line already paid by another client')

    fixture.payroll[0].paid = false
    await refresh()
    await row.locator('.el-checkbox').click()
    await settle.click()
    const confirmPaid = page.locator('.el-drawer__footer').getByRole('button', { name: '确认已支付', exact: true })
    assert.equal(await confirmPaid.isDisabled(), true)
    await page.getByLabel('上传工资支付凭证').setInputFiles(path.join(root, '../船厂/static/test/receipt-placeholder.png'))
    await page.waitForFunction(() => [...document.querySelectorAll('.el-drawer__footer button')].some(b => b.textContent.trim() === '确认已支付' && !b.disabled))
    await confirmPaid.click()
    await page.getByText('已登记工资 ¥80.00', { exact: true }).waitFor()
    assert.equal(settlements.length, 1)
    assert.deepEqual(settlements[0].lineIds, [101])
    assert.equal(settlements[0].projectId, 1)
    assert.equal(settlements[0].month, '2026-11')
    assert.equal(settlements[0].date, '2026-11-04')
    assert.equal(settlements[0].method, '银行转账')
    assert.equal(settlements[0].proof, 'file:1')
    assert.equal(await settle.isDisabled(), true)
    assert.deepEqual(errors, [])
    console.log('PASS an explicitly selected wage line settles once and clears selection')
  } finally {
    await browser.close()
  }
}

checkCsv()
checkPayroll().catch(error => { console.error(error); process.exitCode = 1 })
