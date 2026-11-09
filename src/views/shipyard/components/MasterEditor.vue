<template>
 <el-drawer class="shipyard-dialog" :model-value="true" :title="(form.id?'编辑':'新增')+labels[type]" size="min(540px, 96vw)" :before-close="close">
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <el-form label-position="top">
   <el-form-item :label="labels[type]+'名称'"><el-input v-model="form.name" :aria-label="type==='crew'?'班组名称':'名称'" maxlength="50" /></el-form-item>
   <template v-if="type==='project'"><el-form-item label="工程描述"><el-input v-model="form.title" aria-label="工程描述" maxlength="120"/></el-form-item><el-form-item label="合同总价"><el-input-number v-model="form.price" :min="0.01" :precision="2" aria-label="合同总价"/></el-form-item></template>
   <template v-if="type==='person'"><el-form-item label="工号"><el-input v-model="form.code" aria-label="工号" maxlength="32"/></el-form-item><el-form-item label="所属班组"><CrewSelect :model-value="form.crewId" :crews="crews" :disabled="busy" @update:model-value="selectCrew"/></el-form-item><el-form-item v-if="!form.crewId" label="班组"><el-input v-model="form.team" aria-label="班组" maxlength="50"/></el-form-item><el-form-item label="小时工资"><el-input-number v-model="form.rate" :min="0.01" :precision="2" aria-label="小时工资"/></el-form-item></template>
   <template v-else-if="type==='crew'"><el-form-item label="班组类型"><el-select v-model="form.category" aria-label="班组类型"><el-option label="打磨班组" value="grinding"/><el-option label="油漆班组" value="painting"/></el-select></el-form-item><el-form-item label="班组组长"><el-select v-model="form.leaderId" filterable aria-label="班组组长"><el-option v-for="u in leaders" :key="u.id" :value="u.id" :label="u.name"/></el-select></el-form-item><p class="hint">{{leaders.length?'显示为：班组名称（组长姓名），不会改变账号权限。':'暂无有效组长，请先在账号权限中开通组长账号。'}}</p></template>
   <template v-else><el-form-item label="面积（平方米）"><el-input-number v-model="form.area" :min="0.01" :precision="2" aria-label="面积"/></el-form-item><el-form-item v-if="type==='area'" label="结算单价（每平方米）"><el-input-number v-model="form.rate" :min="0.01" :precision="2" aria-label="结算单价"/></el-form-item><template v-if="type==='area'"><el-form-item label="负责组长（选填）"><el-select v-model="form.leaderId" aria-label="负责组长" placeholder="不指定"><el-option label="不指定" value=""/><el-option v-for="u in areaLeaders" :key="u.id" :value="u.id" :label="u.name"/></el-select></el-form-item><p class="hint">指定后只有该组长可以提交本区域完工；负责组长须已分配该工程。不指定时，各组长对本人施工记录提交完工。</p></template></template>
   <el-form-item v-if="type==='person'" label="班组分类"><TeamSelect v-model="form.teamCategory" :disabled="busy || !!form.crewId" /></el-form-item>
  </el-form><template #footer><el-button @click="close" :disabled="busy">取消</el-button><el-button type="primary" :loading="busy" @click="save">保存资料</el-button></template>
 </el-drawer>
</template>
<script setup>
import {reactive,ref,computed} from 'vue'
import {ElMessage} from 'element-plus'
import TeamSelect from './TeamSelect.vue'
import CrewSelect from './CrewSelect.vue'
const props=defineProps({type:String,value:Object,projectId:[String,Number],write:Function,crews:{type:Array,default:()=>[]},leaders:{type:Array,default:()=>[]}}),emit=defineEmits(['close'])
const labels={project:'工程',area:'区域',person:'人员',crew:'班组'},form=reactive({name:'',title:'',price:0,area:0,rate:0,code:'',team:'',teamCategory:'',crewId:null,category:'grinding',leaderId:null,version:0,projectId:props.projectId,...props.value}),busy=ref(false),error=ref('')
// Q05: '' means no responsible leader; the API receives null.
if(props.type==='area')form.leaderId=form.leaderId==null||form.leaderId===''?'':Number(form.leaderId)
const areaLeaders=computed(()=>{const list=props.leaders.map(u=>({id:Number(u.id),name:u.name}));if(form.leaderId!==''&&form.leaderId!=null&&!list.some(u=>u.id===form.leaderId))list.push({id:form.leaderId,name:(props.value?.leader||'组长')+'（已失效，请重新选择）'});return list})
function selectCrew(id){form.crewId=id;const crew=props.crews.find(c=>c.id===id);if(crew)form.teamCategory=crew.category}
function close(){if(!busy.value)emit('close')}
async function save(){if(busy.value)return;busy.value=true;error.value='';try{const body={...form};if(props.type==='area')body.leaderId=form.leaderId===''||form.leaderId==null?null:Number(form.leaderId);await props.write('/master/'+props.type,body,'PUT');ElMessage.success('基础资料已保存');emit('close')}catch(e){error.value=e.message}finally{busy.value=false}}
</script>
