<template>
 <el-drawer class="shipyard-dialog" :model-value="true" :title="(form.id?'编辑':'新增')+labels[type]" size="min(540px, 96vw)" :before-close="close">
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <el-form label-position="top">
   <el-form-item :label="labels[type]+'名称'"><el-input v-model="form.name" aria-label="名称" maxlength="50" /></el-form-item>
   <template v-if="type==='project'"><el-form-item label="工程描述"><el-input v-model="form.title" aria-label="工程描述" maxlength="120"/></el-form-item><el-form-item label="合同总价"><el-input-number v-model="form.price" :min="0.01" :precision="2" aria-label="合同总价"/></el-form-item></template>
   <template v-if="type==='person'"><el-form-item label="工号"><el-input v-model="form.code" aria-label="工号" maxlength="32"/></el-form-item><el-form-item label="班组"><el-input v-model="form.team" aria-label="班组" maxlength="50"/></el-form-item><el-form-item label="小时工资"><el-input-number v-model="form.rate" :min="0.01" :precision="2" aria-label="小时工资"/></el-form-item></template>
   <template v-else><el-form-item label="面积（平方米）"><el-input-number v-model="form.area" :min="0.01" :precision="2" aria-label="面积"/></el-form-item><el-form-item v-if="type==='area'" label="结算单价（每平方米）"><el-input-number v-model="form.rate" :min="0.01" :precision="2" aria-label="结算单价"/></el-form-item></template>
  </el-form><template #footer><el-button @click="close" :disabled="busy">取消</el-button><el-button type="primary" :loading="busy" @click="save">保存资料</el-button></template>
 </el-drawer>
</template>
<script setup>
import {reactive,ref} from 'vue'
import {ElMessage} from 'element-plus'
const props=defineProps({type:String,value:Object,projectId:[String,Number],write:Function}),emit=defineEmits(['close'])
const labels={project:'工程',area:'区域',person:'人员'},form=reactive({name:'',title:'',price:0,area:0,rate:0,code:'',team:'',projectId:props.projectId,...props.value}),busy=ref(false),error=ref('')
function close(){if(!busy.value)emit('close')}
async function save(){if(busy.value)return;busy.value=true;error.value='';try{await props.write('/master/'+props.type,form,'PUT');ElMessage.success('基础资料已保存');emit('close')}catch(e){error.value=e.message}finally{busy.value=false}}
</script>
