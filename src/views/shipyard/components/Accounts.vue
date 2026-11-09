<template>
 <section v-loading="loading">
  <WechatRegistrations ref="registrations" :accounts="accounts" :projects="projects" @updated="load" />
  <div class="table-heading"><h2>账号与工程权限</h2><el-button type="primary" @click="edit({})">新增账号</el-button></div>
  <div class="filters"><TeamSelect v-model="teamFilter" label="组长班组筛选" filter /></div>
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <el-table :data="shownUsers" row-key="id"><el-table-column prop="username" label="账号"/><el-table-column prop="name" label="姓名"/><el-table-column label="班组分类"><template #default="{row}">{{isLeader(row)?teamLabel(row.teamCategory):'—'}}</template></el-table-column><el-table-column label="角色"><template #default="{row}">{{row.id===1?'超级管理员':row.roleIds.map(id=>accounts.roles.find(r=>r.id===id)?.name).filter(Boolean).join('、')}}</template></el-table-column><el-table-column label="工程范围" min-width="180"><template #default="{row}">{{row.id===1 || row.roleIds.some(id=>['sy_admin','sy_manager','sy_owner'].includes(accounts.roles.find(r=>r.id===id)?.key)) ? '全部工程' : row.projectIds.map(id=>projects.find(p=>p.id===id)?.name).filter(Boolean).join('、') || '未分配工程'}}</template></el-table-column><el-table-column label="状态"><template #default="{row}">{{row.status==='0'?'正常':'已停用'}}</template></el-table-column><el-table-column label="微信" width="90"><template #default="{row}">{{Number(row.wechatBound)?'已绑定':'未绑定'}}</template></el-table-column><el-table-column label="操作" width="180"><template #default="{row}"><template v-if="row.id!==1"><el-button link type="primary" @click="edit(row)">编辑权限</el-button><el-button v-if="Number(row.wechatBound)" link type="danger" :disabled="busy" @click="unbindWechat(row)">解绑微信</el-button></template></template></el-table-column></el-table>
  <h2>角色操作权限</h2><el-table :data="accounts.roles"><el-table-column prop="name" label="角色" width="150"/><el-table-column label="已授权操作"><template #default="{row}">{{row.key==='sy_admin'?'全部船厂操作':row.permissions.map(p=>accounts.catalog.find(c=>c.key===p)?.name).filter(Boolean).join('、')}}</template></el-table-column><el-table-column label="操作" width="100"><template #default="{row}"><el-button v-if="row.key!=='sy_admin'" link type="primary" @click="role=JSON.parse(JSON.stringify(row))">配置权限</el-button></template></el-table-column></el-table>
  <el-drawer class="shipyard-dialog" v-model="editing" title="账号与权限" size="min(560px,96vw)" :before-close="beforeClose">
   <el-form label-position="top"><el-form-item label="账号"><el-input v-model="form.username" aria-label="账号名称" maxlength="20"/></el-form-item><el-form-item label="姓名"><el-input v-model="form.name" aria-label="账号姓名" maxlength="30"/></el-form-item><el-form-item :label="form.id?'重置密码（留空不修改）':'初始密码（12—64位）'"><el-input v-model="form.password" type="password" show-password autocomplete="new-password" aria-label="账号密码"/><p class="hint">{{Number(form.wechatBound)?'该账号已绑定微信。':''}}微信注册开通的账号默认没有密码，如需登录 H5 或 PC 后台，请在此设置账号名和密码（12—64位）。</p></el-form-item><el-form-item label="账号状态"><el-radio-group v-model="form.status"><el-radio value="0">正常</el-radio><el-radio value="1">停用</el-radio></el-radio-group></el-form-item><el-form-item label="角色"><el-checkbox-group v-model="form.roleIds"><el-checkbox v-for="r in accounts.roles" :key="r.id" :value="r.id">{{r.name}}</el-checkbox></el-checkbox-group></el-form-item><el-alert v-if="leaderAccountantConflict" type="warning" :closable="false" show-icon title="组长和会计不能分配给同一账号" description="组长只能查看本人单据，会计需要查看和结算全部财务。除非同时分配管理员、项目经理或负责人，否则保存会被拒绝。"/><el-form-item v-if="isLeader(form)" label="组长班组分类"><TeamSelect v-model="form.teamCategory" label="组长班组分类" :disabled="busy" /></el-form-item><el-form-item label="工程范围"><el-checkbox-group v-model="form.projectIds"><el-checkbox v-for="p in projects" :key="p.id" :value="p.id">{{p.name}}</el-checkbox></el-checkbox-group></el-form-item><p class="hint">管理员、项目经理、负责人可访问全部工程。其他角色仅能访问勾选工程。账号保存后，其原有登录会话失效。</p></el-form>
   <template #footer><el-button :disabled="busy" @click="editing=false">取消</el-button><el-button type="primary" :loading="busy" @click="saveAccount">保存账号</el-button></template>
  </el-drawer>
  <el-drawer class="shipyard-dialog" :model-value="!!role" title="配置角色操作权限" size="min(560px,96vw)" :before-close="beforeClose" @close="role=null"><template v-if="role"><h3>{{role.name}}</h3><el-checkbox-group v-model="role.permissions" class="permission-list"><el-checkbox v-for="c in roleCatalog" :key="c.key" :value="c.key">{{c.name}}</el-checkbox></el-checkbox-group><p class="hint">“账号权限管理”只能由管理员角色持有，不能分配给其他角色。</p></template><template #footer><el-button type="primary" :loading="busy" @click="saveRole">保存角色权限</el-button></template></el-drawer>
 </section>
</template>
<script setup>
import {ref,onMounted,computed} from 'vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import {shipyardApi} from '@/api/shipyard'
import WechatRegistrations from './WechatRegistrations.vue'
import TeamSelect from './TeamSelect.vue'
import {teamLabel,matchesTeam} from '@/utils/shipyard-teams'
const props=defineProps({projects:Array,refresh:Function})
const accounts=ref({users:[],roles:[],catalog:[]}),loading=ref(false),busy=ref(false),error=ref(''),form=ref({}),editing=ref(false),role=ref(null),registrations=ref(null)
const teamFilter=ref('all')
const ACCOUNT_EDIT='shipyard:account:edit'
const roleKeys=user=>(user?.roleIds||[]).map(id=>accounts.value.roles.find(r=>r.id===id)?.key).filter(Boolean)
// Q01: the backend rejects 组长 + 会计 unless the account also has an all-project role.
const leaderAccountantConflict=computed(()=>{const keys=roleKeys(form.value);return keys.includes('sy_leader')&&keys.includes('sy_accountant')&&!keys.some(k=>['sy_admin','sy_manager','sy_owner'].includes(k))})
// Q23: account administration stays with the administrator role.
const roleCatalog=computed(()=>accounts.value.catalog.filter(c=>c.key!==ACCOUNT_EDIT))
const isLeader=user=>user?.roleIds?.some(id=>accounts.value.roles.some(r=>r.id===id&&r.key==='sy_leader'))
const shownUsers=computed(()=>accounts.value.users.filter(u=>teamFilter.value==='all'||(isLeader(u)&&matchesTeam(u,teamFilter.value))))
async function load(){loading.value=true;try{accounts.value=await shipyardApi('/accounts');error.value=''}catch(e){error.value=e.message}finally{loading.value=false}}
onMounted(load)
function edit(value){form.value={username:'',name:'',password:'',status:'0',roleIds:[],projectIds:[],teamCategory:'',...JSON.parse(JSON.stringify(value))};editing.value=true}
function beforeClose(done){if(!busy.value)done()}
async function save(action){if(busy.value)return;busy.value=true;try{await action();editing.value=false;role.value=null;ElMessage.success('权限已保存');await load();await props.refresh()}catch(e){ElMessage.error(e.message)}finally{busy.value=false}}
const saveAccount=()=>save(()=>shipyardApi('/accounts','PUT',form.value))
const saveRole=()=>save(()=>shipyardApi('/roles/'+role.value.id+'/permissions','PUT',{permissions:role.value.permissions.filter(p=>p!==ACCOUNT_EDIT)}))
async function unbindWechat(row){if(busy.value)return;try{await ElMessageBox.confirm('确认解绑 '+row.name+'（'+row.username+'）的微信？解绑后该微信需重新提交注册申请，账号原有登录会话失效。','解绑微信',{type:'warning'})}catch{return}busy.value=true;try{await shipyardApi('/accounts/'+row.id+'/wechat-unbind','POST',{});ElMessage.success('微信已解绑');await Promise.all([load(),registrations.value?.reload()])}catch(e){ElMessage.error(e.message)}finally{busy.value=false}}
defineExpose({reload:()=>Promise.all([load(),registrations.value?.reload()])})
</script>
<style scoped>.permission-list{display:grid;grid-template-columns:1fr 1fr;gap:8px}</style>
