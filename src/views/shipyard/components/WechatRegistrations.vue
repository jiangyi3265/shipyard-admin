<template>
 <section v-loading="loading">
  <div class="table-heading"><div><h2>微信注册审核</h2><p class="hint">审核通过并分配角色、工程后，微信自动关联账号。</p></div><el-button :loading="loading" @click="load">刷新申请</el-button></div>
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <el-radio-group v-model="filter" aria-label="注册申请筛选"><el-radio-button value="pending">待审核 {{ pending }}</el-radio-button><el-radio-button value="all">全部申请</el-radio-button></el-radio-group>
  <el-table :data="visible" row-key="id" empty-text="暂无申请。用户在小程序点击微信登录、填写姓名后，申请会显示在这里。">
   <el-table-column prop="name" label="申请人"/><el-table-column prop="phone" label="联系电话"/><el-table-column prop="note" label="申请说明" min-width="160"/>
   <el-table-column label="状态"><template #default="{row}">{{ labels[row.status] }}</template></el-table-column><el-table-column prop="username" label="关联账号"/>
   <el-table-column prop="reason" label="审核意见"/><el-table-column label="操作" width="105"><template #default="{row}"><el-button v-if="row.status==='pending'" link type="primary" @click="open(row)">审核申请</el-button><span v-else>{{row.reviewer}}</span></template></el-table-column>
  </el-table>
  <el-drawer v-model="editing" class="shipyard-dialog" title="审核微信注册" size="min(560px,96vw)" :close-on-click-modal="false" :before-close="close">
   <template v-if="selected"><p><strong>{{selected.name}}</strong> · {{selected.phone || '未填写联系电话'}}</p><p class="hint">{{selected.note || '未填写申请说明'}}</p>
    <el-form label-position="top">
     <el-form-item label="开通方式"><el-radio-group v-model="mode" @change="changeMode"><el-radio value="new">新建业务账号</el-radio><el-radio value="existing">关联已有账号</el-radio></el-radio-group></el-form-item>
     <el-form-item v-if="mode==='existing'" label="已有业务账号"><el-select v-model="form.userId" filterable clearable aria-label="关联已有账号" @change="selectUser"><el-option v-for="u in availableUsers" :key="u.id" :value="u.id" :label="u.name+' · '+u.username"/></el-select></el-form-item>
     <p v-else class="hint">系统自动创建登录账号并绑定该微信，无需设置密码。</p>
     <el-form-item label="分配角色"><el-checkbox-group v-model="form.roleIds"><el-checkbox v-for="r in accounts.roles" :key="r.id" :value="r.id">{{r.name}}</el-checkbox></el-checkbox-group></el-form-item>
     <el-form-item label="可访问工程"><el-checkbox-group v-model="form.projectIds"><el-checkbox v-for="p in projects" :key="p.id" :value="p.id">{{p.name}}</el-checkbox></el-checkbox-group></el-form-item>
     <el-form-item v-if="isLeader" label="组长班组分类"><TeamSelect v-model="form.teamCategory" label="组长班组分类" :disabled="busy" /></el-form-item>
     <p class="hint">至少分配一个角色。管理员、项目经理、负责人可访问全部工程，其他角色须分配具体工程。</p>
     <el-form-item label="拒绝原因（拒绝时必填）"><el-input v-model="form.reason" type="textarea" :rows="2" maxlength="300" aria-label="注册审核意见" placeholder="例如：请补充所属工程与班组"/></el-form-item>
    </el-form>
    <el-alert v-if="reviewError" :title="reviewError" type="error" :closable="false"/>
   </template>
   <template #footer><el-button :disabled="busy" @click="close">取消</el-button><el-button type="danger" :loading="busy" @click="review(false)">拒绝申请</el-button><el-button type="primary" :loading="busy" @click="review(true)">通过并绑定微信</el-button></template>
  </el-drawer>
 </section>
</template>
<script setup>
import {ref,computed,onMounted} from 'vue'
import {ElMessage} from 'element-plus'
import {shipyardApi} from '@/api/shipyard'
import TeamSelect from './TeamSelect.vue'
const props=defineProps({accounts:Object,projects:Array}),emit=defineEmits(['updated'])
const rows=ref([]),loading=ref(false),busy=ref(false),error=ref(''),reviewError=ref(''),filter=ref('pending'),editing=ref(false),selected=ref(null),mode=ref('new'),form=ref({})
const labels={pending:'待审核',approved:'已通过并绑定',rejected:'已拒绝'}
const pending=computed(()=>rows.value.filter(r=>r.status==='pending').length)
const visible=computed(()=>filter.value==='all'?rows.value:rows.value.filter(r=>r.status==='pending'))
const availableUsers=computed(()=>props.accounts.users.filter(u=>u.id!==1&&u.status==='0'&&!u.wechatBound))
const isLeader=computed(()=>props.accounts.roles.some(r=>r.key==='sy_leader'&&form.value.roleIds?.includes(r.id)))
async function load(){loading.value=true;try{rows.value=await shipyardApi('/wechat/registrations');error.value=''}catch(e){error.value=e.message}finally{loading.value=false}}
function open(row){selected.value=JSON.parse(JSON.stringify(row));form.value={roleIds:[],projectIds:[],reason:'',userId:null,teamCategory:''};mode.value='new';reviewError.value='';editing.value=true}
function close(done){if(busy.value)return;editing.value=false;if(typeof done==='function')done()}
function changeMode(){form.value.userId=null;form.value.roleIds=[];form.value.projectIds=[];form.value.teamCategory=''}
function selectUser(id){const user=props.accounts.users.find(u=>u.id===id);form.value.roleIds=[...(user?.roleIds||[])];form.value.projectIds=[...(user?.projectIds||[])];form.value.teamCategory=user?.teamCategory||''}
async function review(accept){
 if(busy.value||!selected.value)return
 reviewError.value=''
 if(!accept&&!form.value.reason.trim())return reviewError.value='请填写拒绝原因'
 if(accept&&!form.value.roleIds.length)return reviewError.value='请至少分配一个角色'
 if(accept&&mode.value==='existing'&&!form.value.userId)return reviewError.value='请选择关联账号'
 busy.value=true
 try{await shipyardApi('/wechat/registrations/'+selected.value.id+'/review','POST',{...form.value,userId:mode.value==='existing'?form.value.userId:null,accept,version:selected.value.version});editing.value=false;ElMessage.success(accept?'已通过并绑定，下次微信登录自动识别':'已拒绝申请');await load();emit('updated')}
 catch(e){reviewError.value=e.message}finally{busy.value=false}
}
onMounted(load)
defineExpose({reload:load})
</script>
