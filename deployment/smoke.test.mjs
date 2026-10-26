import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,writeFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {startServer} from './server.mjs';import {hashPassword,randomHex} from '../lib/password.mjs';import {importData} from './import-data.mjs';
test('portable HTTP adapter preserves auth, uploads, state and private storage',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'study-portable-')),pepper=randomHex(),password='portable-fixture-only';
  const environment={AUTH_PEPPER:pepper,ADMIN_PASSWORD_HASH:await hashPassword(password,pepper),TEXTBOOK_IMAGE_KEY:'a'.repeat(64),TRUST_PROXY_SECRET:'proxy-fixture-only-'+randomHex()};
  let app=await startServer({environment,dataDirectory:directory,publicOrigin:'https://study.example.test',host:'127.0.0.1',port:0});
  let base='http://127.0.0.1:'+app.server.address().port;
  const call=(url,{method='GET',cookie,data,body,origin='https://study.example.test',extra={}}={})=>fetch(base+url,{method,headers:{'X-Study-Request':'1',Origin:origin,...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{}),...extra},body:data?JSON.stringify(data):body});
  try{
    const html=await (await call('/')).text();for(const id of ['account-button','storage-caption','app','desktop-nav','mobile-nav'])assert(html.includes('id="'+id+'"'));assert(html.includes('/learning.css'));
    for(const url of ['/private/data/study.sqlite','/lib/roster.json','/deployment/secrets.example.env','/.env','/%2e%2e/lib/api.mjs','/vendor/','/%5c..%5clib%5capi.mjs'])assert([400,404].includes((await call(url)).status),url);
    assert.equal((await call('/api/documents')).status,401);assert.equal((await call('/api/auth/login',{method:'POST',data:{id:'administrator01',password},origin:'https://foreign.test'})).status,403);
    let response=await call('/api/auth/login',{method:'POST',data:{id:'administrator01',password}});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Secure; SameSite=Strict/);const cookie=response.headers.get('set-cookie').split(';')[0];assert.equal((await (await call('/api/auth/me',{cookie})).json()).user.role,'admin');
    assert.equal((await (await call('/api/knowledge-cards',{cookie})).json()).cards.length,55);assert.equal((await (await call('/api/textbook',{cookie})).json()).textbook.pages.length,143);
    assert.equal((await call('/api/state',{method:'PATCH',cookie,data:{userId:'administrator01',saved:[6],studied:{textbook:[],course:['v7-p038']}}})).status,200);
    const form=new FormData();form.append('file',new File(['神经网络资料'],'test.txt',{type:'text/plain'}));response=await call('/api/documents',{method:'POST',cookie,body:form});assert.equal(response.status,200);const id=(await response.json()).id;
    assert.equal(await (await call('/api/documents/'+id+'/download',{cookie})).text(),'神经网络资料');assert.equal((await call('/objects/materials/'+id)).status,404);
    // A caller cannot forge a platform client-IP header to avoid the adapter's limiter.
    for(let i=0;i<13;i++)response=await call('/api/auth/login',{method:'POST',data:{id:'missing-account',password:'wrong'},extra:{'CF-Connecting-IP':'192.0.2.'+i}});assert.equal(response.status,429);
    await app.close();app=await startServer({environment,dataDirectory:directory,publicOrigin:'https://study.example.test',host:'127.0.0.1',port:0});base='http://127.0.0.1:'+app.server.address().port;
    const state=(await (await call('/api/state',{cookie})).json()).state;assert.deepEqual(state.saved,[6]);assert.deepEqual(state.studied.course,['v7-p038']);assert.equal(await (await call('/api/documents/'+id+'/download',{cookie})).text(),'神经网络资料');
    assert.equal((await call('/api/auth/logout',{method:'POST',cookie,data:{}})).status,200);assert.equal((await call('/api/auth/me',{cookie})).status,401);
  }finally{await app.close();await rm(directory,{recursive:true,force:true})}
});
test('migration import rejects overwrites and preserves hashes, FK transactions and column allowlists',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'study-import-')),input=path.join(directory,'source.json'),destination=path.join(directory,'db'),hash=await hashPassword('fixture-only',randomHex());
  try{
    const user={id:'2099000001',name:'Fixture',class_name:'Demo',role:'student',password_hash:hash,activated_at:123};
    await writeFile(input,JSON.stringify({users:[user]}));await assert.rejects(importData({inputFile:input,dataDirectory:destination}),/original AUTH_PEPPER/);
    await writeFile(input,JSON.stringify({users:[user],learning_state:[{user_id:'2099000002',data:'{}',updated_at:123}]}));await assert.rejects(importData({inputFile:input,dataDirectory:destination,acknowledgePasswordPepper:true}));
    await writeFile(input,JSON.stringify({users:[user],learning_state:[{user_id:user.id,data:'{"saved":[6]}',updated_at:123}]}));const counts=await importData({inputFile:input,dataDirectory:destination,acknowledgePasswordPepper:true});assert.equal(counts.users,1);assert.equal(counts.learning_state,1);
    await assert.rejects(importData({inputFile:input,dataDirectory:destination,acknowledgePasswordPepper:true}),/empty destination/);
    await writeFile(input,JSON.stringify({sessions:[]}));await assert.rejects(importData({inputFile:input,dataDirectory:path.join(directory,'other')}),/only users/);
    await writeFile(input,JSON.stringify({users:[],truncated_values:2}));await assert.rejects(importData({inputFile:input,dataDirectory:path.join(directory,'other')}),/Truncated/);
    await writeFile(input,JSON.stringify({learning_state:[{user_id:'2099000001',data:'{"kind":"model_projection"}',updated_at:1}]}));await assert.rejects(importData({inputFile:input,dataDirectory:path.join(directory,'other')}),/model-projection/);
  }finally{await rm(directory,{recursive:true,force:true})}
});
