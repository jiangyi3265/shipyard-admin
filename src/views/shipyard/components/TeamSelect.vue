<template>
 <el-select :model-value="modelValue" :aria-label="label" :disabled="disabled" @update:model-value="emit('update:modelValue',$event)"><el-option v-for="o in options" :key="o.value" :value="o.value" :label="o.label"/></el-select>
</template>
<script setup>
import {computed} from 'vue'
import {teamCategories,teamFilters} from '@/utils/shipyard-teams'
const props=defineProps({modelValue:{type:String,default:''},label:{type:String,default:'班组分类'},filter:Boolean,disabled:Boolean})
const emit=defineEmits(['update:modelValue'])
const options=computed(()=>props.filter?teamFilters:teamCategories)
</script>
