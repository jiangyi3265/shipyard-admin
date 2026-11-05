<template>
  <el-drawer class="shipyard-dialog" :model-value="true" :title="form.id ? '修改退回申请' : '新增' + kind + '申请'" size="min(720px, 96vw)" :close-on-click-modal="false" :before-close="close">
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item label="船舶工程"><el-select v-model="form.projectId" aria-label="船舶工程" :disabled="!!form.id" @change="form.areaId=''" ><el-option v-for="p in data.projects" :key="p.id" :value="p.id" :label="p.name" /></el-select></el-form-item>
      <el-form-item v-if="kind !== '报销'" label="工作区域"><el-select v-model="form.areaId" aria-label="工作区域"><el-option v-for="a in areas" :key="a.id" :value="String(a.id)" :label="a.name" /></el-select></el-form-item>
      <template v-if="kind === '用工'">
        <el-form-item label="施工方式"><el-radio-group v-model="form.type"><el-radio-button label="包工" value="包工"/><el-radio-button label="点工" value="点工"/><el-radio-button label="加班" value="加班"/></el-radio-group></el-form-item>
        <div class="form-columns" v-if="form.type==='包工'">
          <el-form-item label="开始日期"><el-date-picker v-model="form.start" value-format="YYYY-MM-DD" aria-label="开始日期" /></el-form-item>
          <el-form-item label="结束日期"><el-date-picker v-model="form.end" value-format="YYYY-MM-DD" aria-label="结束日期" /></el-form-item>
        </div>
        <el-form-item v-else label="施工日期"><el-date-picker v-model="form.date" value-format="YYYY-MM-DD" aria-label="施工日期" /></el-form-item>
        <el-form-item label="工作人员"><el-select v-model="form.people" multiple filterable aria-label="工作人员"><el-option v-for="p in data.people" :key="p.id" :value="p.id" :label="p.name+' · '+p.code" /></el-select></el-form-item>
        <el-form-item v-if="form.type==='包工'" label="承包总价"><el-input-number v-model="form.amount" :min="0.01" :precision="2" aria-label="承包总价" /></el-form-item>
        <el-form-item v-if="form.type==='加班'" label="每人加班小时"><el-input-number v-model="form.duration" :min="0.01" :max="16" :precision="2" aria-label="加班时长" /><span class="hint">加班与正常时薪相同</span></el-form-item>
        <el-table :data="people" size="small">
          <el-table-column prop="name" label="姓名" />
          <el-table-column label="时薪"><template #default="{row}">¥{{money(row.rate)}}</template></el-table-column>
          <el-table-column :label="form.type==='包工'?'每人分配金额':'登记工时'" min-width="190"><template #default="{row}">
            <el-input-number v-if="form.type==='包工'" v-model="form.allocations[row.id]" :precision="2" :min="0.01" :aria-label="row.name+'分配金额'" />
            <el-input-number v-else-if="form.type==='点工'" v-model="form.hours[row.id]" :precision="2" :min="0.01" :max="24" :aria-label="row.name+'工时'" />
            <span v-else>{{form.duration}} 小时</span>
          </template></el-table-column>
        </el-table>
        <p class="hint">预计工资 ¥{{money(total)}}，提交后以服务器计算并保存的工资快照为准。</p>
      </template>
      <template v-else>
        <el-form-item label="业务日期"><el-date-picker v-model="form.date" value-format="YYYY-MM-DD" aria-label="业务日期" /></el-form-item>
        <el-form-item v-if="kind==='报销'" label="报销类别"><el-select v-model="form.category" aria-label="报销类别"><el-option v-for="c in categories" :key="c" :label="c" :value="c" /></el-select></el-form-item>
        <el-form-item v-else label="被罚人员"><el-select v-model="form.person" filterable aria-label="被罚人员"><el-option v-for="p in data.people" :key="p.id" :value="p.id" :label="p.name+' · '+p.code" /></el-select></el-form-item>
        <el-form-item :label="kind+'金额'"><el-input-number v-model="form.amount" :min="0.01" :precision="2" :aria-label="kind+'金额'" /></el-form-item>
      </template>
      <el-form-item :label="kind==='报销'?'报销用途':kind==='罚款'?'罚款原因':'施工备注'"><el-input v-model="form.note" type="textarea" :rows="3" maxlength="500" show-word-limit aria-label="申请说明" /></el-form-item>
      <el-form-item :label="kind==='报销'?'发票凭证（必填）':'附件（选填）'">
        <input type="file" accept="image/png,image/jpeg" multiple aria-label="上传申请凭证" :disabled="uploading || busy" @change="upload" />
        <p class="hint">最多 6 张，每张不超过 5 MB。{{uploading?'上传中…':''}}</p>
        <div v-for="(f,i) in form.files" :key="f" class="file-line"><span>凭证 {{i+1}}</span><el-button link type="danger" @click="form.files.splice(i,1)">移除</el-button></div>
        <PrivateImages :ids="form.files" />
      </el-form-item>
    </el-form>
    <template #footer><el-button :disabled="busy || uploading" @click="saveDraft">存草稿</el-button><el-button :disabled="busy" @click="close">取消</el-button><el-button type="primary" :loading="busy" :disabled="uploading" @click="submit">提交审批</el-button></template>
  </el-drawer>
</template>
<script setup>
import {reactive,computed,ref} from 'vue'
import {ElMessage} from 'element-plus'
import {uploadImage,requestKey,money} from '@/api/shipyard'
import {sumHourlyWages} from '@/utils/wage-preview'
import PrivateImages from './PrivateImages.vue'
const props=defineProps({kind:String,data:Object,projectId:[Number,String],record:Object,write:Function}),emit=defineEmits(['close','saved'])
const categories=['劳保用品','材料采购','交通差旅','设备维修','其他费用']
const busy=ref(false),uploading=ref(false),error=ref('')
const draftProject=props.record?.projectId ?? props.projectId
function draftKey(projectId=draftProject){return 'shipyard-pc-draft-v2-'+JSON.stringify([props.data.user.id,props.kind,String(projectId),props.record?[String(props.record.id),props.record.version]:'new'])}
let draft={}
try {
 const saved=JSON.parse(localStorage.getItem(draftKey())||'{}')
 const sameRecord=props.record ? saved.id===props.record.id && saved.version===props.record.version : !saved.id
 if(saved && String(saved.projectId)===String(draftProject) && sameRecord)draft=saved
} catch {}
const form=reactive({projectId:draftProject,areaId:'',type:'包工',date:props.data.serverDate,start:props.data.serverDate,end:props.data.serverDate,people:[],hours:{},allocations:{},duration:1,amount:0,category:categories[0],person:'',note:'',files:[],requestKey:requestKey(),...(props.record?JSON.parse(JSON.stringify(props.record)):{}),...draft})
form.areaId=form.areaId==null?'':String(form.areaId)
const areas=computed(()=>props.data.areas.filter(a=>Number(a.projectId)===Number(form.projectId)&&!a.completedAt&&(props.kind!=='用工'||!a.completionRequestedAt))),people=computed(()=>props.data.people.filter(p=>form.people.includes(p.id)))
const total=computed(()=>form.type==='包工'?people.value.reduce((sum,p)=>sum+Number(form.allocations[p.id]||0),0):sumHourlyWages(people.value.map(p=>({rate:p.rate,hours:form.type==='加班'?form.duration:form.hours[p.id]}))))
function close(){if(!busy.value&&!uploading.value)emit('close')}
function saveDraft(){try{localStorage.setItem(draftKey(form.projectId),JSON.stringify(form));ElMessage.success('草稿已保存到当前浏览器')}catch{error.value='浏览器无法保存草稿，请检查存储空间或直接提交'}}
async function upload(e){uploading.value=true;try{for(const f of e.target.files){if(form.files.length>=6)throw Error('最多上传6张凭证');form.files.push(await uploadImage(f))}}catch(err){error.value=err.message}finally{uploading.value=false;e.target.value=''}}
async function submit(){
 if(busy.value||uploading.value)return
 error.value=''
 if(!form.projectId||!form.note.trim())return error.value='请选择工程并填写申请说明'
 if(props.kind!=='报销'&&!form.areaId)return error.value='请选择工作区域'
 if(props.kind==='用工'&&!areas.value.some(a=>String(a.id)===String(form.areaId)))return error.value='工作区域已完工、待确认完工或不可访问，请重新选择'
 if(props.kind==='用工'&&!form.people.length)return error.value='请选择工作人员'
 if(props.kind==='用工'&&form.type==='包工'&&Math.round(total.value*100)!==Math.round(Number(form.amount)*100))return error.value='每人工资分配合计必须等于包工总价'
 if(props.kind==='报销'&&!form.files.length)return error.value='请上传发票凭证'
 busy.value=true
 try{const item=await props.write('/records'+(form.id?'/'+form.id:''),{...form,kind:props.kind},form.id?'PUT':'POST');try{localStorage.removeItem(draftKey(form.projectId))}catch{};ElMessage.success('申请已提交');emit('saved',item);emit('close')}catch(e){error.value=e.message}finally{busy.value=false}
}
</script>
