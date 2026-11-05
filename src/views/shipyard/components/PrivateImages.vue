<template><div class="attachments"><el-image v-for="id in ids" :key="id" :src="images[id]" :preview-src-list="Object.values(images)" fit="contain" preview-teleported><template #error><span>图片加载失败</span></template></el-image><el-button v-if="failed" link @click="load">重试加载凭证</el-button></div></template>
<script setup>
import {ref,watch} from 'vue'
import {shipyardApi} from '@/api/shipyard'
const props=defineProps({ids:{type:Array,default:()=>[]}}),images=ref({}),failed=ref(false)
let revision=0
async function load(){const current=++revision;images.value={};failed.value=false;for(const id of props.ids.filter(Boolean)){try{const src=await shipyardApi('/files/'+id.slice(5));if(current===revision)images.value[id]=src}catch{if(current===revision)failed.value=true}}}
watch(()=>props.ids,load,{immediate:true,deep:true})
</script>
<style scoped>.attachments{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}.el-image{width:140px;height:100px;border:1px solid #e5edf2;border-radius:8px}.el-image span{font-size:12px;color:#718498}</style>
