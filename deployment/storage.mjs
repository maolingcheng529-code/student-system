import {DatabaseSync} from 'node:sqlite';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,readdir,rename,rm,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import {randomUUID,createHash} from 'node:crypto';

export async function openDatabase(dataDirectory,projectDirectory){
  await mkdir(dataDirectory,{recursive:true,mode:0o700});
  const sql=new DatabaseSync(path.join(dataDirectory,'study.sqlite'));
  sql.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000');
  sql.exec('CREATE TABLE IF NOT EXISTS _deployment_migrations (name TEXT PRIMARY KEY, digest TEXT NOT NULL)');
  for(const name of (await readdir(path.join(projectDirectory,'drizzle'))).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    const text=await readFile(path.join(projectDirectory,'drizzle',name),'utf8'),digest=createHash('sha256').update(text).digest('hex');
    const applied=sql.prepare('SELECT digest FROM _deployment_migrations WHERE name=?').get(name);
    if(applied){if(applied.digest!==digest)throw Error('A previously applied migration changed: '+name);continue}
    sql.exec('BEGIN IMMEDIATE');try{sql.exec(text);sql.prepare('INSERT INTO _deployment_migrations(name,digest) VALUES (?,?)').run(name,digest);sql.exec('COMMIT')}catch(error){sql.exec('ROLLBACK');sql.close();throw error}
  }
  const DB={prepare(query){return {values:[],bind(...values){return {...this,values}},async first(){return sql.prepare(query).get(...this.values)||null},async all(){return {results:sql.prepare(query).all(...this.values)}},async run(){const r=sql.prepare(query).run(...this.values);return {success:true,meta:{changes:Number(r.changes)}}}}},async batch(statements){sql.exec('BEGIN IMMEDIATE');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}}};
  return {sql,DB,close:()=>sql.close()};
}

export function objectPath(directory,key){
  if(typeof key!=='string'||!/^materials\/[a-f0-9-]{36}$/.test(key))throw Error('Invalid storage key');
  return path.join(directory,'objects',...key.split('/'));
}
export function diskBucket(dataDirectory){return {
  async put(key,body){const destination=objectPath(dataDirectory,key);await mkdir(path.dirname(destination),{recursive:true,mode:0o700});const temporary=destination+'.'+randomUUID()+'.tmp';try{const bytes=new Uint8Array(await new Response(body).arrayBuffer());if(bytes.length>20*1024*1024)throw Error('Object exceeds upload size limit');await writeFile(temporary,bytes,{mode:0o600,flag:'wx'});await rename(temporary,destination)}catch(error){await rm(temporary,{force:true});throw error}},
  async get(key){const filename=objectPath(dataDirectory,key);try{const info=await stat(filename);if(!info.isFile())return null;return {body:Readable.toWeb(createReadStream(filename))}}catch(error){if(error.code==='ENOENT')return null;throw error}},
  async delete(key){await rm(objectPath(dataDirectory,key),{force:true})}
}}
