<template>
  <el-drawer class="shipyard-dialog" :model-value="true" :title="item.title || '单据详情'" size="min(800px, 96vw)" :before-close="close">
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-alert v-if="changed" title="此单据已由其他端更新，请重新加载后操作" type="warning" :closable="false"><el-button link @click="reload">重新加载单据</el-button></el-alert>
    <div class="record-heading"><el-tag :type="item.status==='已作废'?'info':item.status==='作废待确认'?'warning':undefined">{{item.status}}</el-tag><strong>¥{{money(item.amount)}}</strong><el-button link @click="reload">刷新单据</el-button></div>
    <el-descriptions :column="2" border><el-descriptions-item label="工程">{{item.ship}}</el-descriptions-item><el-descriptions-item label="区域">{{item.area || '工程费用'}}</el-descriptions-item><el-descriptions-item label="申请人">{{item.author}}</el-descriptions-item><el-descriptions-item :label="item.start ? '工期' : '业务日期'">{{item.start ? item.start+' — '+item.end : item.date}}</el-descriptions-item><el-descriptions-item v-if="item.type==='包工'" label="工资归属月">{{item.payrollMonth || String(item.start||'').slice(0,7)}}</el-descriptions-item><el-descriptions-item v-if="item.person" label="被罚人员">{{(item.personSnapshot || data.people.find(p=>p.id===item.person) || {}).name}}</el-descriptions-item><el-descriptions-item label="说明" :span="2">{{item.note}}</el-descriptions-item><el-descriptions-item v-if="item.voidReason" label="作废申请原因" :span="2">{{item.voidReason}}</el-descriptions-item></el-descriptions>
    <PrivateImages :ids="item.files || []" />
    <el-table v-if="item.lines?.length" :data="item.lines"><el-table-column prop="name" label="工人"/><el-table-column prop="hours" label="工时"/><el-table-column prop="rate" label="时薪快照"/><el-table-column prop="multiplier" label="倍率"/><el-table-column label="工资"><template #default="{row}">¥{{money(row.amount)}}</template></el-table-column><el-table-column label="结算"><template #default="{row}">{{row.paymentId?'已结算':'未结算'}}</template></el-table-column></el-table>
    <section v-if="item.managerSignature || item.ownerSignature"><h3>审批签字</h3><p>{{item.managerName}} {{item.managerAt}} / {{item.ownerName}} {{item.ownerAt}}</p><PrivateImages :ids="[item.managerSignature,item.ownerSignature].filter(Boolean)" /></section>
    <section v-if="item.proof"><h3>付款凭证</h3><p>{{item.paidDate}} · {{item.method}}</p><PrivateImages :ids="[item.proof]" /></section>
    <section v-if="reviewable && !changed">
      <h3>审批处理</h3><el-input v-model="opinion" type="textarea" aria-label="审批意见" placeholder="审批意见，退回时必填" maxlength="500" :rows="3" />
      <template v-if="item.kind==='报销'"><SignaturePad v-if="!signature" @signed="sign"/><div v-else><PrivateImages :ids="[signature]"/><el-button link @click="signature=''">重新签字</el-button></div></template>
      <div class="action-row"><el-button type="danger" plain :loading="busy" @click="review(false)">退回修改</el-button><el-button type="primary" :loading="busy" :disabled="item.kind==='报销'&&!signature" @click="review(true)">{{item.kind==='报销'?'签字并通过':'审批通过'}}</el-button></div>
    </section>
    <section v-if="voidReviewable && !changed">
      <h3>作废确认</h3><p class="hint">{{item.author}} 申请作废：{{item.voidReason}}</p><el-input v-model="opinion" type="textarea" aria-label="作废处理意见" placeholder="处理意见，驳回作废时必填" maxlength="500" :rows="3" />
      <div class="action-row"><el-button type="danger" plain :loading="busy" @click="reviewVoid(false)">驳回作废</el-button><el-button type="primary" :loading="busy" @click="reviewVoid(true)">同意作废</el-button></div>
    </section>
    <section v-if="item.kind==='报销' && item.status==='待付款' && can('expense:pay') && !changed">
      <h3>登记实际付款</h3>
      <p v-if="ownRecord" class="hint">这是您本人提交的报销，由其他会计登记付款。</p>
      <template v-else><el-form label-position="top"><el-form-item label="付款日期"><el-date-picker v-model="paidDate" value-format="YYYY-MM-DD" :disabled-date="isFuture" aria-label="付款日期"/></el-form-item><el-form-item label="付款方式"><el-select v-model="method"><el-option v-for="m in payMethods" :key="m" :value="m" :label="m"/></el-select></el-form-item><el-form-item label="付款凭证"><input type="file" accept="image/png,image/jpeg" aria-label="上传付款凭证" :disabled="busy" @change="uploadProof"/><PrivateImages :ids="proof?[proof]:[]"/></el-form-item></el-form><el-button type="primary" :disabled="!proof" :loading="busy" @click="pay">确认已付款</el-button></template>
    </section>
    <section v-if="item.kind==='罚款' && item.status==='会计待处理' && can('fine:handle') && !changed"><h3>登记罚款收款</h3><el-form label-position="top"><el-form-item label="收款日期"><el-date-picker v-model="receiptDate" value-format="YYYY-MM-DD" :disabled-date="isFuture" :clearable="false" aria-label="收款日期"/></el-form-item><el-form-item label="收款说明"><el-input v-model="receiptNote" placeholder="填写实际收款方式或凭证编号" aria-label="收款说明" maxlength="500"/></el-form-item></el-form><div class="action-row"><el-button type="primary" :loading="busy" @click="receive">登记已收款</el-button></div></section>
    <h3>处理记录</h3><el-timeline><el-timeline-item v-for="a in item.audit" :key="a.id" :timestamp="String(a.time)">{{a.actor}} · {{a.action}} · {{a.status}}<p v-if="a.opinion">{{a.opinion}}</p></el-timeline-item></el-timeline>
    <template #footer><template v-if="editable"><el-button type="danger" plain :disabled="busy" @click="requestVoid">申请作废</el-button><el-button type="primary" :disabled="busy" @click="emit('edit',item)">修改并重新提交</el-button></template><el-button @click="close" :disabled="busy">关闭</el-button></template>
  </el-drawer>
</template>
<script setup>
import {ref,computed} from 'vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import {shipyardApi,uploadImage,money,payMethods,dayText} from '@/api/shipyard'
import PrivateImages from './PrivateImages.vue'
import SignaturePad from './SignaturePad.vue'
const props=defineProps({record:Object,data:Object,can:Function,write:Function}),emit=defineEmits(['close','edit'])
const item=ref(JSON.parse(JSON.stringify(props.record))),busy=ref(false),error=ref(''),opinion=ref(''),signature=ref(''),proof=ref(''),receiptNote=ref(''),receiptDate=ref(props.data.serverDate),paidDate=ref(props.data.serverDate),method=ref('银行转账')
const approvePermission=kind=>kind==='用工'?'work:approve':kind==='罚款'?'fine:approve':'expense:approve'
const isFuture=d=>dayText(d)>props.data.serverDate
const ownRecord=computed(()=>Number(item.value.createdBy)===Number(props.data.user.id))
const changed=computed(()=>{const latest=props.data.records.find(r=>r.id===item.value.id);return !latest||latest.version>item.value.version})
const editable=computed(()=>item.value.status==='已退回'&&ownRecord.value&&!changed.value&&props.can(item.value.kind==='用工'?'work:submit':item.value.kind==='罚款'?'fine:submit':'expense:submit'))
const reviewable=computed(()=>{const r=item.value;if(ownRecord.value)return false;if(r.status==='待负责人签字')return props.can('expense:confirm')&&r.managerId!==props.data.user.id;return r.status==='待审批'&&props.can(approvePermission(r.kind))})
const voidReviewable=computed(()=>item.value.status==='作废待确认'&&!ownRecord.value&&props.can(approvePermission(item.value.kind)))
function close(){if(!busy.value)emit('close')}
async function run(action){if(busy.value)return;busy.value=true;error.value='';try{await action()}catch(e){if(e!=='cancel'&&e!=='close')error.value=e.message||String(e)}finally{busy.value=false}}
const reload=()=>run(async()=>{item.value=await shipyardApi('/records/'+item.value.id);signature.value='';opinion.value='';proof.value='';receiptNote.value='';receiptDate.value=props.data.serverDate;paidDate.value=props.data.serverDate;method.value='银行转账'})
const sign=file=>run(async()=>{signature.value=await uploadImage(file)})
const uploadProof=e=>run(async()=>{try{if(e.target.files[0])proof.value=await uploadImage(e.target.files[0])}finally{e.target.value=''}})
const review=accept=>run(async()=>{if(!accept&&!opinion.value.trim())throw Error('退回必须填写原因');item.value=await props.write('/records/'+item.value.id+'/review',{version:item.value.version,accept,opinion:opinion.value,signature:signature.value});signature.value='';ElMessage.success(accept?'审批已通过':'已退回申请人')})
const requestVoid=()=>run(async()=>{const {value}=await ElMessageBox.prompt('作废后单据不再计入任何统计，需审批人确认。请填写作废原因','申请作废',{inputPlaceholder:'作废原因，不超过500字',inputValidator:v=>{const t=String(v||'').trim();return !!t&&t.length<=500},inputErrorMessage:'请填写作废原因，不超过500字'});item.value=await props.write('/records/'+item.value.id+'/void-request',{version:item.value.version,reason:String(value).trim()});ElMessage.success('已申请作废，等待审批人确认')})
const reviewVoid=accept=>run(async()=>{if(!accept&&!opinion.value.trim())throw Error('驳回作废必须填写原因');if(accept)await ElMessageBox.confirm('确认作废该单据？作废后不再计入统计，历史记录保留。','同意作废');item.value=await props.write('/records/'+item.value.id+'/void-review',{version:item.value.version,accept,opinion:opinion.value.trim()});opinion.value='';ElMessage.success(accept?'单据已作废':'已驳回作废申请，单据退回申请人')})
const pay=()=>run(async()=>{if(!paidDate.value)throw Error('请选择付款日期');await ElMessageBox.confirm('确认已实际完成 ¥'+money(item.value.amount)+' 的付款？登记后计入支出。','确认付款');item.value=await props.write('/records/'+item.value.id+'/payment',{version:item.value.version,proof:proof.value,date:paidDate.value,method:method.value});ElMessage.success('付款已登记')})
const receive=()=>run(async()=>{if(!receiptDate.value)throw Error('请选择收款日期');if(!receiptNote.value.trim())throw Error('请填写收款说明');await ElMessageBox.confirm('确认已实际收到该笔罚款？','确认收款');item.value=await props.write('/records/'+item.value.id+'/fine-receipt',{version:item.value.version,note:receiptNote.value,date:receiptDate.value});ElMessage.success('收款已登记')})
</script>
