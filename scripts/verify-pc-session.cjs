const {chromium}=require('./playwright-runtime.cjs'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:5181',credentials=require('./test-credentials.cjs').load();
let browser;const errors=[];
async function fillLogin(p,user,data){const code=JSON.parse(execFileSync('redis-cli',['-p','6383','-n','1','--raw','GET','captcha_codes:'+data.uuid],{encoding:'utf8',windowsHide:true}));await p.getByPlaceholder('账号',{exact:true}).fill(user);await p.getByPlaceholder('密码',{exact:true}).fill(credentials.password);await p.getByPlaceholder('验证码',{exact:true}).fill(String(code));await p.getByRole('button',{name:'登 录',exact:true}).click();await p.getByRole('heading',{name:'我的待办',exact:true}).waitFor({timeout:60000})}
(async()=>{
 browser=await chromium.launch({headless:true});const p=await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));
 let wait=p.waitForResponse(r=>r.url().endsWith('/captchaImage'));await p.goto(base+'/login');await fillLogin(p,'admin',await(await wait).json());await p.getByRole('button',{name:'账号权限',exact:true}).waitFor();
 // Expire the real server session without reloading the browser. This exercises the SPA relogin path.
 const token=(await p.context().cookies()).find(c=>c.name==='Admin-Token').value;
 const logout=await p.request.post(base+'/dev-api/logout',{headers:{Authorization:'Bearer '+token}});assert.equal((await logout.json()).code,200);
 wait=p.waitForResponse(r=>r.url().endsWith('/captchaImage'));await p.getByRole('button',{name:'刷新数据',exact:true}).click();await p.waitForURL('**/login?**');await fillLogin(p,'sy_manager',await(await wait).json());
 await p.locator('.user-nickname').filter({hasText:'项目经理'}).waitFor();assert.equal(await p.getByRole('button',{name:'账号权限',exact:true}).count(),0);await p.getByRole('button',{name:'工资结算',exact:true}).click();await p.locator('h2').filter({hasText:'工资结算'}).waitFor();assert.equal(await p.getByRole('button',{name:'确认工资结算'}).count(),0);assert.deepEqual(errors,[]);
 console.log('PASS PC 会话失效后同页换账号登录，用户信息与权限重新加载');
 fs.mkdirSync(path.join(root,'artifacts/pc-session'),{recursive:true});await p.screenshot({path:path.join(root,'artifacts/pc-session/manager.png')});fs.writeFileSync(path.join(root,'artifacts/pc-session/result.json'),JSON.stringify({completed:true,date:new Date().toISOString(),errors},null,2));
})().catch(e=>{console.error(require('./test-credentials.cjs').safeError(e));process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
