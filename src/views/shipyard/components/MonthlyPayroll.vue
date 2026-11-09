<template>
 <div class="monthly-payroll">
  <div class="table-heading"><h2>月度工时与工资</h2><el-button :disabled="!rows.length" @click="exportReport">导出月报</el-button></div>
  <div class="filters"><el-select v-model="month" aria-label="月报月份"><el-option v-for="m in monthOptions" :key="m" :label="m" :value="m"/></el-select><el-select v-model="projectId" aria-label="月报工程" filterable><el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id"/></el-select><el-input v-model="search" aria-label="搜索月报工人" placeholder="搜索姓名、工号或班组" clearable/></div>
  <p class="hint">按用工日期归属月份，仅统计已审批记录；包工只计工资，不计工时。以下合计为所选月份、工程的全部人员。</p>
  <div class="monthly-metrics"><div><span>工人数</span><strong>{{report.totals.workerCount}} 人</strong></div><div><span>总工时</span><strong>{{money(report.totals.totalHours)}} 小时</strong></div><div><span>工资合计</span><strong>¥{{money(report.totals.totalWages)}}</strong></div></div>
  <el-table :data="rows" row-key="workerId" :empty-text="search.trim()?'没有匹配的工人，请调整搜索条件':'该月份暂无已审批的工时工资记录'">
   <el-table-column prop="name" label="工人" min-width="120"/><el-table-column prop="code" label="工号" min-width="100"/><el-table-column prop="team" label="班组" min-width="180"/>
   <el-table-column label="正常工时" width="95"><template #default="{row}">{{money(row.normalHours)}}</template></el-table-column><el-table-column label="加班工时" width="95"><template #default="{row}">{{money(row.overtimeHours)}}</template></el-table-column>
   <el-table-column label="总工时" width="95"><template #default="{row}"><span data-field="totalHours">{{money(row.totalHours)}}</span></template></el-table-column>
   <el-table-column label="工资合计" min-width="130"><template #default="{row}"><strong data-field="totalWages">¥{{money(row.totalWages)}}</strong><div v-if="row.contractWages" class="hint">含包工 ¥{{money(row.contractWages)}}</div></template></el-table-column>
   <el-table-column label="已结算" width="115"><template #default="{row}"><span data-field="paidWages">¥{{money(row.paidWages)}}</span></template></el-table-column><el-table-column label="待结算" width="115"><template #default="{row}"><span data-field="unpaidWages">¥{{money(row.unpaidWages)}}</span></template></el-table-column><el-table-column prop="status" label="状态" width="100"/>
  </el-table>
  <p v-if="search.trim()&&rows.length" class="hint">显示匹配的 {{rows.length}} 人，导出仅包含当前搜索结果。</p>
 </div>
</template>
<script setup>
import {ref,computed,watch} from 'vue';
import {money,exportCsv} from '@/api/shipyard';
import {monthlyReport,reportMonths,findReportWorkers,monthlyCsv} from '@/utils/shipyard-monthly-payroll';
const props=defineProps({data:{type:Object,required:true}});
const month=ref(''),projectId=ref(0),search=ref('');
watch(()=>props.data.serverDate,date=>{if(!month.value&&date)month.value=date.slice(0,7)},{immediate:true});
const monthOptions=computed(()=>reportMonths(props.data.serverDate));
const projects=computed(()=>[{id:0,name:'全部授权工程'},...props.data.projects]);
watch(projects,values=>{if(!values.some(p=>p.id===projectId.value))projectId.value=0});
const report=computed(()=>monthlyReport(props.data.monthlyPayroll,month.value,projectId.value));
const rows=computed(()=>findReportWorkers(report.value.rows,search.value));
function exportReport(){if(rows.value.length)exportCsv(month.value+'工时工资月报',monthlyCsv(rows.value,month.value,projects.value.find(p=>p.id===projectId.value)?.name));}
</script>
<style scoped>
.monthly-payroll{margin-top:28px;min-width:0}.monthly-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:18px 0}.monthly-metrics>div{background:#f1f6f8;border-radius:8px;padding:14px}.monthly-metrics span{display:block;color:#718498;font-size:13px}.monthly-metrics strong{display:block;margin-top:8px;font-size:18px;overflow-wrap:anywhere}@media(max-width:600px){.monthly-metrics{grid-template-columns:1fr;gap:8px}}
</style>
