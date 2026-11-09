<template>
 <el-select :model-value="modelValue || ''" :aria-label="label" :disabled="disabled" filterable @update:model-value="emit('update:modelValue',$event)">
  <el-option v-if="filter" label="全部具体班组" value="all"/><el-option label="未分配具体班组" value=""/>
  <el-option v-for="crew in crews" :key="crew.id" :value="crew.id" :label="crewLabel(crew)"/>
 </el-select>
</template>
<script setup>
import {crewLabel} from '@/utils/shipyard-crews';
defineProps({modelValue:[Number,String],crews:{type:Array,default:()=>[]},label:{type:String,default:'所属班组'},filter:Boolean,disabled:Boolean});
const emit=defineEmits(['update:modelValue']);
</script>
