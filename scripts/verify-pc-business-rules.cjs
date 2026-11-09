// Q06/Q10/Q15 through the real PC pages against the isolated test API (8081) and PC dev server (5181).
const {chromium}=require('./playwright-runtime.cjs'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/pc-business-rules'),credentials=require('./test-credentials.cjs').load(),base='http://127.0.0.1:5181',api8081='http://127.0.0.1:8081',run=Date.now().toString().slice(-8),key=()=>crypto.randomUUID(),png=path.resolve(root,'../船厂/static/test/receipt-placeholder.png');
const tokens={},passed=[],errors=[];let browser;fs.mkdirSync(out,{recursive:true});
const captcha=uuid=>String(JSON.parse(execFileSync('redis-cli',['-p','6383','-n','1','--raw','GET','captcha_codes:'+uuid],{encoding:'utf8',windowsHide:true})));
async function api(user,url,method='GET',body,expected=200){const r=await(await fetch(api8081+url,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+tokens[user]}:{})},body:body===undefined?undefined:JSON.stringify(body)})).json();assert.equal(r.code,expected,url+': '+r.msg);return r.data??r}
async function token(user){const c=await api(null,'/captchaImage');tokens[user]=(await api(null,'/login','POST',{username:user,password:credentials.password,uuid:c.uuid,code:captcha(c.uuid)})).token}
async function upload(user){const form=new FormData();form.append('file',new Blob([fs.readFileSync(png)],{type:'image/png'}),'receipt.png');const r=await(await fetch(api8081+'/shipyard/files',{method:'POST',headers:{Authorization:'Bearer '+tokens[user]},body:form})).json();assert.equal(r.code,200,r.msg);return r.data.id}
const report=t=>{passed.push(t);console.log('PASS '+t)};
const response=(p,test,method='POST')=>p.waitForResponse(r=>test(r.url())&&r.request().method()===method);
async function login(user){const c=await browser.newContext({viewport:{width:1440,height:1050}}),p=await c.newPage();p.on('pageerror',e=>errors.push(user+': '+e.message));const wait=p.waitForResponse(r=>r.url().endsWith('/captchaImage'));await p.goto(base+'/login');const data=await(await wait).json();await p.getByPlaceholder('账号',{exact:true}).fill(user);await p.getByPlaceholder('密码',{exact:true}).fill(credentials.password);await p.getByPlaceholder('验证码',{exact:true}).fill(captcha(data.uuid));await p.getByRole('button',{name:'登 录',exact:true}).click();await p.getByRole('heading',{name:'待处理事项',exact:true}).waitFor({timeout:60000});return p}
async function tab(p,n){await p.getByRole('navigation',{name:'船厂业务导航'}).getByRole('button',{name:n,exact:true}).click();await p.waitForURL('**/'+({'工程与人员':'projects','申请与审批':'records','完工归档':'archive','收支台账':'ledger'}[n]))}
async function refresh(p){const ready=p.waitForResponse(r=>r.url().endsWith('/shipyard/bootstrap'));await p.getByRole('button',{name:'刷新数据',exact:true}).click();await ready;await p.locator('button.is-loading').filter({hasText:'刷新数据'}).waitFor({state:'hidden'})}
async function open(p,id){await tab(p,'申请与审批');await p.getByRole('textbox',{name:'搜索申请',exact:true}).fill(id);await p.getByRole('button',{name:'查看详情',exact:true}).click()}
async function prompt(p,text){const box=p.locator('.el-message-box');await box.waitFor();if(text!==undefined)await box.locator('input,textarea').first().fill(text);await box.getByRole('button',{name:'确定',exact:true}).click()}
(async()=>{
 for(const user of ['admin','sy_leader','sy_manager','sy_accountant','sy_owner'])await token(user);
 let state=await api('admin','/shipyard/bootstrap');const project=state.projects[0],today=state.serverDate,areaName='PC规则'+run;
 await api('admin','/shipyard/master/area','PUT',{projectId:project.id,name:areaName,area:60,rate:10});
 await api('admin','/shipyard/master/person','PUT',{name:'PC规则'+run,code:'PR'+run,team:'PC规则',rate:30});
 state=await api('admin','/shipyard/bootstrap');const area=state.areas.find(a=>a.name===areaName),worker=state.people.find(p=>p.code==='PR'+run);
 const work=hours=>({requestKey:key(),projectId:project.id,areaId:area.id,kind:'用工',type:'点工',people:[worker.id],hours:{[worker.id]:hours},note:'PC规则验证'+run,date:today});
 browser=await chromium.launch({headless:true});

 // Q06: the applicant requests void on a returned record; the reviewer confirms it.
 let item=await api('sy_leader','/shipyard/records','POST',work(2));
 item=await api('sy_manager','/shipyard/records/'+item.id+'/review','POST',{version:item.version,accept:false,opinion:'PC作废验证'});
 const leader=await login('sy_leader');await open(leader,item.id);
 let wait=response(leader,u=>u.endsWith('/records/'+item.id+'/void-request'));await leader.getByRole('button',{name:'申请作废',exact:true}).click();await prompt(leader,'PC现场取消');
 assert.equal((await(await wait).json()).data.status,'作废待确认');
 const manager=await login('sy_manager');await open(manager,item.id);await manager.getByText('PC现场取消').first().waitFor();
 await manager.getByRole('textbox',{name:'作废处理意见',exact:true}).fill('同意');
 wait=response(manager,u=>u.endsWith('/records/'+item.id+'/void-review'));await manager.getByRole('button',{name:'同意作废',exact:true}).click();await prompt(manager);
 assert.equal((await(await wait).json()).data.status,'已作废');await manager.screenshot({path:path.join(out,'void.png'),fullPage:true});
 report('PC 退回单申请作废、审批人确认作废');

 // Q10: reopen a completed area from the archive.
 const done=await api('sy_leader','/shipyard/records','POST',work(3));
 await api('sy_manager','/shipyard/records/'+done.id+'/review','POST',{version:done.version,accept:true});
 await api('sy_leader','/shipyard/areas/'+area.id+'/completion-request','POST',{});
 await api('sy_manager','/shipyard/areas/'+area.id+'/complete','POST',{});
 await manager.locator('.el-drawer__footer').getByRole('button',{name:'关闭',exact:true}).click();await refresh(manager);await tab(manager,'完工归档');
 const archived=manager.locator('.el-table__body tr').filter({hasText:areaName}).first();await archived.waitFor();
 wait=response(manager,u=>u.endsWith('/areas/'+area.id+'/reopen'));await archived.getByRole('button',{name:'重新开工',exact:true}).click();await prompt(manager,'PC返工');
 assert.equal((await(await wait).json()).code,200);
 const reopened=(await api('sy_manager','/shipyard/bootstrap')).areas.find(a=>a.id===area.id);assert.ok(!reopened.completedAt);assert.equal(reopened.status,'进行中');
 report('PC 完工归档重新开工，区域回到进行中');

 // Q15: the accountant asks to reverse a manual entry and the owner approves it.
 const title='PC冲正'+run;await api('sy_accountant','/shipyard/ledger','POST',{projectId:project.id,title,amount:-9.5,date:today,note:'PC冲正验证',files:[await upload('sy_accountant')],requestKey:key()});
 const ledgerId=(await api('sy_accountant','/shipyard/bootstrap')).transactions.find(t=>t.title===title).id;
 const accountant=await login('sy_accountant');await tab(accountant,'收支台账');const row=accountant.locator('.el-table__body tr').filter({hasText:title}).first();await row.waitFor();
 wait=response(accountant,u=>u.endsWith('/ledger/'+ledgerId+'/reversal'));await row.getByRole('button',{name:'申请冲正',exact:true}).click();await prompt(accountant,'PC重复登记');
 assert.equal((await(await wait).json()).code,200);await row.getByText('冲正待审批').first().waitFor();
 assert.equal(await row.getByRole('button',{name:'同意冲正',exact:true}).count(),0);
 const owner=await login('sy_owner');await tab(owner,'收支台账');const ownerRow=owner.locator('.el-table__body tr').filter({hasText:title}).first();await ownerRow.waitFor();
 wait=response(owner,u=>u.includes('/ledger/reversals/')&&u.endsWith('/review'));await ownerRow.getByRole('button',{name:'同意冲正',exact:true}).click();await prompt(owner,'PC核对同意');
 assert.equal((await(await wait).json()).code,200);
 const ledger=(await api('sy_accountant','/shipyard/bootstrap')).transactions;assert.equal(ledger.find(t=>t.id===ledgerId).reversal.status,'approved');assert.ok(ledger.some(t=>t.source==='reversal'&&String(t.sourceId)===String(ledgerId)&&Number(t.amount)===9.5));
 await owner.screenshot({path:path.join(out,'reversal.png'),fullPage:true});
 report('PC 会计申请冲正、本人不能审批，负责人同意后生成对冲流水');

 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({completed:true,date:new Date().toISOString(),passed,errors},null,2));
})().catch(async e=>{console.error(require('./test-credentials.cjs').safeError(e));console.error(require('./test-credentials.cjs').safeError(errors));if(browser)for(const [i,c]of browser.contexts().entries())for(const p of c.pages())await p.screenshot({path:path.join(out,'failure-'+i+'.png')}).catch(()=>{});process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
