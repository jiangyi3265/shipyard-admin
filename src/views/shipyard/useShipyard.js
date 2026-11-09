import { reactive, ref, computed, onMounted, onActivated, onDeactivated, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { shipyardApi } from '@/api/shipyard'
import { getToken } from '@/utils/auth'

export function useShipyard() {
  const data = reactive({user: {}, roles: [], grants: [], projects: [], areas: [], people: [], crews: [], crewLeaders: [], workerArchive: undefined, records: [], payroll: [], monthlyPayroll: [], transactions: [], attendance: [], notifications: [], serverDate: ''})
  const loading = ref(false), ready = ref(false), error = ref(''), projectId = ref(''), month = ref(''), updated = ref(''), busy = ref(false)
  let pending, timer, disposed = false
  const can = key => data.grants.includes('*:*:*') || data.grants.includes('shipyard:' + key)
  const scoped = values => values.filter(row => !projectId.value || Number(row.projectId) === Number(projectId.value))
  const project = computed(() => data.projects.find(p => p.id === Number(projectId.value)))
  async function refresh() {
    if (pending) return pending
    const token = getToken()
    loading.value = true
    pending = (async () => {
      try {
        const result = await shipyardApi('/bootstrap')
        if (disposed || token !== getToken()) return
        Object.assign(data, {workerArchive: undefined}, result)
        if (!data.projects.some(p => p.id === Number(projectId.value))) projectId.value = data.projects[0]?.id || ''
        if (!month.value) month.value = data.serverDate.slice(0, 7)
        updated.value = new Date().toLocaleTimeString('zh-CN', {hour12:false})
        ready.value = true; error.value = ''
      } catch (e) {
        if (!disposed) {error.value = e.message; if (!getToken()) ready.value = false}
        throw e
      } finally {loading.value = false; pending = null}
    })()
    return pending
  }
  async function act(action) {
    if (busy.value) return
    busy.value = true
    try { return await action() } catch (e) { if(e !== 'cancel' && e !== 'close') ElMessage.error(e.message || String(e)) } finally { busy.value = false }
  }
  async function write(path, body, method='POST') {
    const value = await shipyardApi(path, method, body)
    // Avoid telling users a committed financial operation failed when its follow-up read fails.
    if (pending) await pending.catch(() => {})
    await refresh().catch(() => ElMessage.warning('操作已保存，刷新失败，请重新加载后继续'))
    return value
  }
  const wake = () => { if (!document.hidden && !busy.value && getToken()) refresh().catch(() => {}) }
  function start(){clearInterval(timer);wake();timer=setInterval(wake,20000);window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake)}
  function stop(){clearInterval(timer);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake)}
  onMounted(start)
  onActivated(start)
  onDeactivated(stop)
  onBeforeUnmount(() => {disposed=true;stop()})
  return {data, loading, ready, error, projectId, project, month, updated, busy, can, scoped, refresh, write, act}
}
