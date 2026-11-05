import { getToken, removeToken } from '@/utils/auth'
import router from '@/router'

// All three clients call the same RuoYi APIs. No browser-side approvals or finance ledger.
export async function shipyardApi(path, method = 'GET', body) {
  const token = getToken()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const multipart = body instanceof FormData
    const response = await fetch((import.meta.env.VITE_APP_BASE_API || '/dev-api') + '/shipyard' + path, {
      method, signal: controller.signal,
      headers: { Authorization: 'Bearer ' + token, ...(!multipart ? {'Content-Type': 'application/json'} : {}) },
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body)
    })
    const result = await response.json().catch(() => null)
    if (getToken() !== token) throw new Error('账号已切换，请重新打开页面')
    if (response.status === 401 || result?.code === 401) {
      removeToken()
      await router.replace('/login?redirect=' + encodeURIComponent(router.currentRoute.value.fullPath))
      throw new Error('登录已过期，请重新登录')
    }
    if (!response.ok || result?.code !== 200) throw new Error(result?.msg || '请求失败，请稍后重试')
    return result.data
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('请求超时，请刷新查看最新状态后重试')
    if (error instanceof TypeError) throw new Error('无法连接后端，请检查网络')
    throw error
  } finally { clearTimeout(timeout) }
}
export async function uploadImage(file) {
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('请选择不超过 5 MB 的 PNG 或 JPEG 图片')
  const form = new FormData(); form.append('file', file, file.name || 'signature.png')
  return (await shipyardApi('/files', 'POST', form)).id
}
export const requestKey = () => crypto.randomUUID()
export const money = value => Number(value || 0).toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2})
export function exportCsv(title, rows) {
  const escape = value => {
    let text = String(value ?? '')
    const negativeNumber = /^\s*-(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*$/i.test(text)
    if (/^\s*[=+@]/.test(text) || (/^\s*-/.test(text) && !negativeNumber) || /^[\t\r\n]/.test(text)) text = "'" + text
    return '"' + text.replaceAll('"', '""') + '"'
  }
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n')], {type: 'text/csv;charset=utf-8'}))
  const link = document.createElement('a'); link.href = url; link.download = title + '.csv'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
