<template>
  <div class="signature-pad">
    <p>请在框内手写签字，支持鼠标和触屏</p>
    <canvas ref="canvas" aria-label="手写签字区域" @pointerdown="start" @pointermove="move" @pointerup="end" @pointercancel="end" />
    <div class="signature-actions"><el-button @click="clear" :disabled="busy">重新签字</el-button><el-button type="primary" :disabled="!signed" :loading="busy" @click="save">保存签字</el-button></div>
  </div>
</template>
<script setup>
import { ref, onMounted } from 'vue'
const emit=defineEmits(['signed'])
const canvas=ref(),signed=ref(false),busy=ref(false)
let ctx,painting=false
onMounted(()=>{canvas.value.width=1000;canvas.value.height=340;ctx=canvas.value.getContext('2d');clear()})
function clear(){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1000,340);signed.value=false;painting=false}
function point(e){const r=canvas.value.getBoundingClientRect();return [(e.clientX-r.left)*1000/r.width,(e.clientY-r.top)*340/r.height]}
function start(e){if(busy.value)return;e.preventDefault();painting=true;canvas.value.setPointerCapture(e.pointerId);ctx.beginPath();ctx.moveTo(...point(e))}
function move(e){if(!painting)return;ctx.strokeStyle='#142c3c';ctx.lineWidth=4;ctx.lineCap='round';ctx.lineTo(...point(e));ctx.stroke();signed.value=true}
function end(){painting=false}
function save(){if(!signed.value||busy.value)return;busy.value=true;canvas.value.toBlob(blob=>{busy.value=false;if(blob)emit('signed',new File([blob],'signature.png',{type:'image/png'}))},'image/png')}
</script>
<style scoped>
.signature-pad p{color:#718498;font-size:13px}.signature-pad canvas{width:100%;height:170px;border:1px dashed #9bbac4;border-radius:9px;touch-action:none;background:#fff}.signature-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:12px}
</style>
