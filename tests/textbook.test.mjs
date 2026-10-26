import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleAPI} from '../lib/api.mjs';
import {digest,randomHex} from '../lib/password.mjs';
import {validateDocumentIndex} from '../lib/document-index.mjs';
const book=JSON.parse(readFileSync('lib/textbook.json','utf8'));
test('143 compressed textbook images include page 38 in complete printed order',()=>{
  assert.equal(book.pages.length,143);assert.deepEqual(book.missingPages,[]);
  assert.equal(book.importedBy.id,'administrator01');assert(book.compression.compressedBytes/book.compression.originalBytes<.1);
  const numbered=book.pages.filter(p=>p.printedPage&&!p.alternate&&p.pageNumber>0);
  assert.deepEqual(numbered.map(p=>p.pageNumber),Array.from({length:119},(_,i)=>i+1).filter(n=>![1,20,52,85].includes(n)));
  for(const n of [1,20,52,85])assert(book.pages.some(p=>p.pageNumber===n&&!p.printedPage));
  const p=numbered.find(p=>p.pageNumber===38);assert(p.text.includes('抽象特征学习'));assert(p.boxes.length>10);
  for(const p of book.pages){assert(readFileSync('public'+p.assetUrl).length>1000);assert(p.boxes.every(b=>b[0]+b[1]<=p.text.length))}
});
test('textbook login, admin controls, gated image key and reading resume',async()=>{
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
  for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
  const DB={prepare(q){return {bind(...v){this.v=v;return this},async first(){return sql.prepare(q).get(...(this.v||[]))||null},async run(){const r=sql.prepare(q).run(...(this.v||[]));return {meta:{changes:Number(r.changes)}}},async all(){return {results:sql.prepare(q).all(...(this.v||[]))}}}}};
  const cookies={};for(const role of ['student','admin']){sql.prepare('INSERT INTO users(id,name,class_name,role) VALUES (?,?,?,?)').run(role,role,'',role);const token=randomHex();sql.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(await digest(token),role,Date.now()+60000);cookies[role]='__Host-zx_session='+token}
  const call=(path,role,method='GET',data)=>handleAPI(new Request('https://study.test/api'+path,{method,headers:{'X-Study-Request':'1','Content-Type':'application/json',Origin:'https://study.test',...(role?{Cookie:cookies[role]}:{})},...(method==='GET'?{}:{body:JSON.stringify(data||{})})}),{DB,TEXTBOOK_IMAGE_KEY:'a'.repeat(64)});
  assert.equal((await call('/textbook')).status,401);assert.equal((await call('/textbook/image-key')).status,401);
  assert.equal((await (await call('/textbook','student')).json()).textbook.pages.length,143);
  const key=await call('/textbook/image-key','student');assert.equal(key.status,200);assert(key.headers.get('cache-control').includes('no-store'));
  assert.equal((await call('/textbook','student','DELETE')).status,403);
  await call('/textbook','admin','DELETE');assert.equal((await (await call('/textbook','student')).json()).textbook,null);assert.equal((await call('/textbook/image-key','student')).status,403);await call('/textbook','admin','POST');
  const lastPage={route:'textbook',query:'抽象特征学习',chapterFilter:-1,scroll:200,cardId:null,bookPage:book.pages.find(p=>p.pageNumber===38).id};
  assert.equal((await call('/state','student','PATCH',{userId:'student',lastPage,visit:lastPage})).status,200);
  assert.equal((await (await call('/state','student')).json()).state.lastPage.bookPage,lastPage.bookPage);
  assert.equal((await call('/state','student','PATCH',{userId:'student',lastPage:{...lastPage,bookPage:'invalid'}})).status,400);
  assert.equal((await call('/documents/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/index','student','PATCH',{pages:[{text:'abc'}]})).status,403);
  assert.equal((await call('/knowledge-cards')).status,401);
  const cards=(await (await call('/knowledge-cards','student')).json()).cards;assert.equal(cards.length,55);
  const bookPayload=(await (await call('/textbook','student')).json()).textbook;assert.equal(bookPayload.knowledgeGraph.nodes.length,88);assert.equal(bookPayload.knowledgeGraph.edges.length,132);
  const studied={textbook:[lastPage.bookPage],course:['v7-p038']},annotation={kind:'textbook',pageId:lastPage.bookPage,important:true,difficult:true,note:'抽象特征如何保持不变性？',excerpt:'高级特征具有更强的不变性',updatedAt:Date.now()};
  assert.equal((await call('/state','student','PATCH',{userId:'student',studied,annotations:[annotation],saved:[56],learned:[56]})).status,200);
  const state=(await (await call('/state','student')).json()).state;assert.deepEqual(state.studied,studied);assert.deepEqual(state.annotations,[annotation]);assert.equal(state.lastPage.bookPage,lastPage.bookPage);
  const adminState=(await (await call('/state','admin')).json()).state;assert.deepEqual(adminState.studied,{textbook:[],course:[]});assert.deepEqual(adminState.annotations,[]);
  assert.equal((await call('/state','admin','PATCH',{userId:'student',annotations:[]})).status,409);
  assert.equal((await call('/state','student','PATCH',{userId:'student',studied:{textbook:['invalid'],course:[]}})).status,400);
  assert.equal((await call('/state','student','PATCH',{userId:'student',annotations:[{...annotation,note:'x'.repeat(601)}]})).status,400);
  assert.equal((await call('/state','student','PATCH',{userId:'student',annotations:[annotation,annotation]})).status,400);
  await call('/textbook','admin','DELETE');const remaining=(await (await call('/knowledge-cards','student')).json()).cards;assert(remaining.length>0&&remaining.length<55);assert(remaining.every(c=>c.sources.every(s=>s.kind==='course')));await call('/textbook','admin','POST');
});
test('uploaded document indexes preserve page positions and reject oversized payloads',()=>{
  const r=validateDocumentIndex([{pageNumber:99,title:'第一页',text:'神经网络',method:'ocr'},{text:'梯度下降'}]);
  assert.deepEqual(r.pages.map(p=>p.pageNumber),[1,2]);assert.equal(r.text,'神经网络\n\n梯度下降');assert.throws(()=>validateDocumentIndex([]));assert.throws(()=>validateDocumentIndex([{text:'x'.repeat(100001)}]));
});
