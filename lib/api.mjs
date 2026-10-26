import roster from './roster.json' with { type: 'json' };
import {digest,randomHex,hashPassword,verifyPassword} from './password.mjs';
import {ensureRoster} from './roster.mjs';
import {getImportedCourse,setCourseEnabled,coursePageIds} from './course.mjs';
import {getImportedTextbook,setTextbookEnabled,textbookPageIds} from './textbook.mjs';
import {validateDocumentIndex} from './document-index.mjs';
import knowledgeCards from './knowledge-cards.json' with {type:'json'};
import {AIError,aiStatus,configureAI,disableAI,answerQuestion,limitConfig} from './ai.mjs';
const cardIds=new Set([...knowledgeCards.map(c=>c.id),2,3]);
const ADMIN='administrator01', COOKIE='__Host-zx_session', DAYS=7*24*60*60;
const views=['home','library','map','ask','review','materials','account','students','course','textbook','document'];
export class ApiError extends Error {constructor(status,message){super(message);this.status=status}}
const fail=(status,message)=>{throw new ApiError(status,message)};
const json=(value,status=200,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...headers}});
function cookie(req){return req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||''}
async function readJSON(req,max=65536){if(!req.headers.get('content-type')?.includes('application/json'))fail(415,'请求格式错误');const text=await req.text();if(text.length>max)fail(413,'请求内容过长');try{return JSON.parse(text)}catch{fail(400,'请求内容无法读取')}}
function originCheck(req){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)fail(403,'请从本网站提交操作');if(req.headers.get('x-study-request')!=='1')fail(403,'无效操作来源')}
async function rateLimit(req,env,id){
  const ip=req.headers.get('cf-connecting-ip')||req.headers.get('oai-authenticated-user-id')||'unknown';
  const now=Date.now(), reset=now+15*60*1000;
  for(const [scope,value,max] of [['ip',ip,60],['account',id,12]]){
    const key=scope+':'+await digest(value);
    const row=await env.DB.prepare('INSERT INTO auth_limits (key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at < ? THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at < ? THEN ? ELSE reset_at END RETURNING count').bind(key,reset,now,now,reset).first();
    if(row.count>max)fail(429,'尝试次数较多，请 15 分钟后再试');
  }
}
function publicUser(row){return {id:row.id,name:row.name,className:row.class_name,role:row.role}}
async function currentUser(req,env){const token=cookie(req);if(!/^[a-f0-9]{64}$/.test(token))fail(401,'请先登录');const user=await env.DB.prepare('SELECT u.id,u.name,u.class_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(token),Date.now()).first();if(!user)fail(401,'登录已过期，请重新登录');return publicUser(user)}
async function admin(req,env){const u=await currentUser(req,env);if(u.role!=='admin')fail(403,'只有管理员可以执行此操作');return u}
async function session(req,env,user){const token=randomHex();const old=cookie(req);if(old)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(old)).run();await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()),env.DB.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await digest(token),user.id,Date.now()+DAYS*1000)]);return json({user:publicUser(user) },200,{'Set-Cookie':`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DAYS}`})}
const defaultState=()=>({saved:[],learned:[],studied:{textbook:[],course:[]},annotations:[],history:[],lastPage:{route:'home',query:'',chapterFilter:-1,scroll:0,cardId:null,coursePage:null,bookPage:null,documentId:null,documentPage:null}});
async function loadState(env,id){const row=await env.DB.prepare('SELECT data FROM learning_state WHERE user_id=?').bind(id).first();if(!row)return defaultState();try{return {...defaultState(),...JSON.parse(row.data)}}catch{return defaultState()}}
function validIds(a){return Array.isArray(a)&&a.length<=cardIds.size&&a.every(x=>cardIds.has(x))}
function page(p){if(!p||!views.includes(p.route)||typeof p.query!=='string'||p.query.length>200||!Number.isInteger(p.chapterFilter)||p.chapterFilter< -1||p.chapterFilter>5||!Number.isFinite(p.scroll)||p.scroll<0||p.scroll>100000||(p.cardId!==null&&(!cardIds.has(p.cardId)))||(p.coursePage!=null&&!coursePageIds.has(p.coursePage))||(p.bookPage!=null&&!textbookPageIds.has(p.bookPage))||(p.documentId!=null&&!/^[a-f0-9-]{36}$/.test(p.documentId))||(p.documentPage!=null&&(!Number.isInteger(p.documentPage)||p.documentPage<1||p.documentPage>200)))fail(400,'浏览记录格式错误');return {route:p.route,query:p.query,chapterFilter:p.chapterFilter,scroll:p.scroll,cardId:p.cardId,coursePage:p.coursePage??null,bookPage:p.bookPage??null,documentId:p.documentId??null,documentPage:p.documentPage??null}}
export async function handleAPI(req,env){
  try{
    if(!env.DB)fail(503,'账号服务尚未就绪，请稍后重试');
    const path=new URL(req.url).pathname.slice(4),method=req.method;
    if(!['GET','HEAD'].includes(method))originCheck(req);
    if(path==='/ai/status'&&method==='GET'){await currentUser(req,env);return json(await aiStatus(env))}
    if(path==='/ai/ask'&&method==='POST'){const u=await currentUser(req,env);return json(await answerQuestion(env,u,await readJSON(req,5000)))}
    if(path==='/admin/ai/config'&&method==='POST'){const u=await admin(req,env);await limitConfig(env,u);return json(await configureAI(env,await readJSON(req,5000)))}
    if(path==='/admin/ai/config'&&method==='DELETE'){const u=await admin(req,env);await limitConfig(env,u);return json(await disableAI(env))}
    if(path.startsWith('/auth/'))await ensureRoster(env.DB);
    if(path==='/auth/login'&&method==='POST'){
      const b=await readJSON(req,4096);const id=String(b.id||'').trim();if(!id||id.length>40||typeof b.password!=='string'||b.password.length>128)fail(400,'请输入正确的账号和密码');
      await rateLimit(req,env,id);
      if(id===ADMIN){
        if(!env.ADMIN_PASSWORD_HASH||!env.AUTH_PEPPER)fail(503,'管理员账号尚未配置');
        if(!await verifyPassword(b.password,env.ADMIN_PASSWORD_HASH,env.AUTH_PEPPER))fail(401,'账号或密码不正确');
        await env.DB.prepare("INSERT OR IGNORE INTO users (id,name,class_name,role,activated_at) VALUES (?, '课程管理员', '', 'admin', ?)").bind(ADMIN,Date.now()).run();
        return session(req,env,{id:ADMIN,name:'课程管理员',class_name:'',role:'admin'});
      }
      const row=await env.DB.prepare("SELECT * FROM users WHERE id=? AND role='student'").bind(id).first();
      if(row&&!row.password_hash)return json({activationRequired:true,message:'这是该账号首次使用，请核对姓名并设置密码。'});
      if(!row||!await verifyPassword(b.password,row.password_hash,env.AUTH_PEPPER))fail(401,'账号或密码不正确');
      return session(req,env,row);
    }
    if(path==='/auth/activate'&&method==='POST'){
      const b=await readJSON(req,4096);const id=String(b.id||'').trim(),name=String(b.name||'').trim();
      if(!/^\d{6,20}$/.test(id)||!name||typeof b.password!=='string'||b.password.length<8||b.password.length>128||b.password!==b.confirmPassword)fail(400,'请填写学号和姓名，并设置一致的 8–128 位密码');
      await rateLimit(req,env,id);
      const row=await env.DB.prepare("SELECT * FROM users WHERE id=? AND role='student'").bind(id).first();
      if(!row||row.name!==name)fail(400,'学号与姓名不匹配，请核对名单信息');
      if(row.password_hash)fail(409,'该账号已设置密码，请返回登录；忘记密码请联系管理员');
      const hash=await hashPassword(b.password,env.AUTH_PEPPER);
      const result=await env.DB.prepare('UPDATE users SET password_hash=?,activated_at=? WHERE id=? AND password_hash IS NULL').bind(hash,Date.now(),id).run();
      if(result.meta.changes!==1)fail(409,'该账号已激活，请返回登录');
      return session(req,env,row);
    }
    if(path==='/auth/logout'&&method==='POST'){
      const token=cookie(req);if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
      return json({ok:true},200,{'Set-Cookie':`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`});
    }
    if(path==='/auth/me'&&method==='GET')return json({user:await currentUser(req,env)});
    if(path==='/knowledge-cards'&&method==='GET'){
      await currentUser(req,env);const [bookResult,courseResult]=await Promise.all([getImportedTextbook(env.DB),getImportedCourse(env.DB)]);
      return json({cards:knowledgeCards.map(c=>({...c,sources:c.sources.filter(s=>s.kind==='textbook'?bookResult.enabled:courseResult.enabled)})).filter(c=>c.sources.length)});
    }
    if(path==='/textbook'&&method==='GET'){

      const u=await currentUser(req,env),result=await getImportedTextbook(env.DB);
      return json({enabled:result.enabled,textbook:result.enabled||u.role==='admin'?result.textbook:null});
    }
    if(path==='/textbook/image-key'&&method==='GET'){
      await currentUser(req,env);const result=await getImportedTextbook(env.DB);
      if(!result.enabled)fail(403,'教材已下架');
      if(!/^[a-f0-9]{64}$/.test(env.TEXTBOOK_IMAGE_KEY||''))fail(503,'教材图片服务尚未就绪');
      return json({key:env.TEXTBOOK_IMAGE_KEY});
    }
    if(path==='/textbook'&&(method==='POST'||method==='DELETE')){
      await admin(req,env);await setTextbookEnabled(env.DB,method==='POST');return json({ok:true,enabled:method==='POST'});
    }
    if(path==='/course'&&method==='GET'){
      const u=await currentUser(req,env),result=await getImportedCourse(env.DB);
      return json({enabled:result.enabled,course:result.enabled||u.role==='admin'?result.course:null});
    }
    if(path==='/course'&&(method==='POST'||method==='DELETE')){
      await admin(req,env);await setCourseEnabled(env.DB,method==='POST');return json({ok:true,enabled:method==='POST'});
    }
    if(path==='/admin/import-roster'&&method==='POST'){
      await admin(req,env);let added=0;
      for(let i=0;i<roster.length;i+=30){const results=await env.DB.batch(roster.slice(i,i+30).map(r=>env.DB.prepare("INSERT OR IGNORE INTO users (id,name,class_name,role) VALUES (?,?,?,'student')").bind(r.studentId,r.name,r.className)));added+=results.reduce((s,r)=>s+r.meta.changes,0)}
      const count=await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role='student'").first();return json({added,total:count.count});
    }
    if(path==='/admin/students'&&method==='GET'){
      await admin(req,env);const rows=await env.DB.prepare("SELECT id,name,class_name,activated_at FROM users WHERE role='student' ORDER BY id").all();return json({students:rows.results.map(r=>({id:r.id,name:r.name,className:r.class_name,activated:!!r.activated_at}))});
    }
    if(path==='/state'&&method==='GET'){const u=await currentUser(req,env);return json({state:await loadState(env,u.id)})}
    if(path==='/state'&&method==='PATCH'){
      const u=await currentUser(req,env),b=await readJSON(req,400000);if(b.userId!==u.id)fail(409,'当前账号已切换，请刷新页面');
      const state=await loadState(env,u.id),patch={};
      for(const k of ['saved','learned'])if(k in b){if(!validIds(b[k]))fail(400,'学习记录格式错误');state[k]=[...new Set(b[k])];patch[k]=state[k]}
      if('studied' in b){const s=b.studied;if(!s||typeof s!=='object'||!Array.isArray(s.textbook)||!Array.isArray(s.course)||s.textbook.length>textbookPageIds.size||s.course.length>coursePageIds.size||!s.textbook.every(id=>textbookPageIds.has(id))||!s.course.every(id=>coursePageIds.has(id)))fail(400,'已学习页码格式错误');state.studied={textbook:[...new Set(s.textbook)],course:[...new Set(s.course)]};patch.studied=state.studied}
      if('annotations' in b){const notes=b.annotations;if(!Array.isArray(notes)||notes.length>textbookPageIds.size+coursePageIds.size)fail(400,'重难点记录过多');const keys=new Set();state.annotations=notes.map(n=>{if(!n||!['textbook','course'].includes(n.kind)||!(n.kind==='textbook'?textbookPageIds:coursePageIds).has(n.pageId)||typeof n.important!=='boolean'||typeof n.difficult!=='boolean'||typeof n.note!=='string'||n.note.length>600||typeof n.excerpt!=='string'||n.excerpt.length>400||!Number.isFinite(n.updatedAt)||n.updatedAt<0||n.updatedAt>Date.now()+60000)fail(400,'重难点记录格式错误');const key=n.kind+':'+n.pageId;if(keys.has(key))fail(400,'重难点页码重复');keys.add(key);return {kind:n.kind,pageId:n.pageId,important:n.important,difficult:n.difficult,note:n.note,excerpt:n.excerpt,updatedAt:n.updatedAt}});patch.annotations=state.annotations}
      if(b.lastPage){state.lastPage=page(b.lastPage);if(u.role!=='admin'&&state.lastPage.route==='students')fail(403,'无权访问学生管理');patch.lastPage=state.lastPage}
      if(b.visit){const visit=page(b.visit);if(u.role!=='admin'&&visit.route==='students')fail(403,'无权访问学生管理');const previous=state.history[0];if(!previous||previous.route!==visit.route||previous.cardId!==visit.cardId||previous.query!==visit.query||previous.chapterFilter!==visit.chapterFilter||previous.coursePage!==visit.coursePage||previous.bookPage!==visit.bookPage||previous.documentId!==visit.documentId||previous.documentPage!==visit.documentPage){state.history=[{...visit,at:Date.now()},...state.history].slice(0,100)}}
      if(b.visit)patch.history=state.history;
      const entries=Object.entries(patch);
      const expression=entries.length?`json_set(learning_state.data,${entries.map(([key])=>`'$.${key}',json(?)`).join(',')})`:'learning_state.data';
      await env.DB.prepare(`INSERT INTO learning_state (user_id,data,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=${expression},updated_at=excluded.updated_at`).bind(u.id,JSON.stringify(state),Date.now(),...entries.map(([,value])=>JSON.stringify(value))).run();
      return json({ok:true,history:state.history});
    }
    if(path==='/documents'&&method==='GET'){
      await currentUser(req,env);const rows=await env.DB.prepare('SELECT id,name,text,pages,size,mime,created_at FROM documents ORDER BY created_at DESC').all();return json({documents:rows.results.map(r=>({...r,pages:JSON.parse(r.pages||'[]')}))});
    }
    if(path==='/documents'&&method==='POST'){
      const u=await admin(req,env);if(!env.BUCKET)fail(503,'资料存储尚未就绪');
      if(Number(req.headers.get('content-length'))>21*1024*1024)fail(413,'文件大小不能超过 20 MB');
      const form=await req.formData(),file=form.get('file');if(!file||typeof file==='string'||!file.name)fail(400,'请选择资料文件');
      if(/\.ppt$/i.test(file.name))fail(400,'旧版 PPT 请先另存为 PPTX，保证文字和页码可正确检索');
      if(!/\.(pdf|pptx|txt|md|jpg|jpeg|png|webp)$/i.test(file.name)||file.name.length>180)fail(400,'支持 PDF、PPTX、文本和图片资料');
      if(file.size===0||file.size>20*1024*1024)fail(413,'请选择 20 MB 以内的非空文件');
      let text='',pages=[];
      if(form.get('index')){try{const indexed=validateDocumentIndex(JSON.parse(form.get('index')));text=indexed.text;pages=indexed.pages}catch(e){fail(400,e.message)}}
      else if(/\.(txt|md)$/i.test(file.name)){if(file.size>1024*1024)fail(413,'文本资料不能超过 1 MB');try{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer())}catch{fail(400,'文本资料请使用 UTF-8 编码')}if(!text.trim())fail(400,'文本资料没有文字');pages=validateDocumentIndex([{title:file.name,text}]).pages}
      else fail(400,'请等待文件文字提取完成后再上传，避免资料不可检索');
      const id=crypto.randomUUID(),key='materials/'+id;await env.BUCKET.put(key,file.stream(),{httpMetadata:{contentType:'application/octet-stream'}});
      try{await env.DB.prepare('INSERT INTO documents (id,name,text,pages,size,mime,object_key,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,file.name,text,JSON.stringify(pages),file.size,file.type||'application/octet-stream',key,u.id,Date.now()).run()}catch(error){await env.BUCKET.delete(key);throw error}
      return json({ok:true,id});
    }
    const indexMatch=path.match(/^\/documents\/([a-f0-9-]{36})\/index$/);
    if(indexMatch&&method==='PATCH'){
      await admin(req,env);const b=await readJSON(req,1600000);let indexed;try{indexed=validateDocumentIndex(b.pages)}catch(e){fail(400,e.message)}
      const result=await env.DB.prepare('UPDATE documents SET text=?,pages=? WHERE id=?').bind(indexed.text,JSON.stringify(indexed.pages),indexMatch[1]).run();if(!result.meta.changes)fail(404,'资料不存在');return json({ok:true});
    }
    const match=path.match(/^\/documents\/([a-f0-9-]{36})(\/download)?$/);
    if(match&&method==='DELETE'&&!match[2]){
      await admin(req,env);const row=await env.DB.prepare('SELECT object_key FROM documents WHERE id=?').bind(match[1]).first();if(!row)fail(404,'资料不存在');await env.DB.prepare('DELETE FROM documents WHERE id=?').bind(match[1]).run();await env.BUCKET.delete(row.object_key);return json({ok:true});
    }
    if(match&&method==='GET'&&match[2]){
      await currentUser(req,env);const row=await env.DB.prepare('SELECT name,mime,object_key FROM documents WHERE id=?').bind(match[1]).first();if(!row)fail(404,'资料不存在');const object=await env.BUCKET.get(row.object_key);if(!object)fail(404,'资料文件不存在');return new Response(object.body,{headers:{'Content-Type':new URL(req.url).searchParams.get('inline')==='1'&&/\.(pdf|png|jpe?g|webp)$/i.test(row.name)?row.mime:'application/octet-stream','Content-Disposition':`${new URL(req.url).searchParams.get('inline')==='1'&&/\.(pdf|png|jpe?g|webp)$/i.test(row.name)?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
    }
    fail(404,'接口不存在');
  }catch(e){if(e instanceof ApiError||e instanceof AIError)return json({error:e.message},e.status);console.error('Study API failed',e?.name);return json({error:'服务暂时不可用，请稍后重试'},500)}
}
