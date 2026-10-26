import {readFile,stat,copyFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDatabase,objectPath} from './storage.mjs';

const projectDirectory=fileURLToPath(new URL('../',import.meta.url));
const definitions={
  users:['id','name','class_name','role','password_hash','activated_at'],
  learning_state:['user_id','data','updated_at'],
  course_sources:['id','title','source_url','payload','enabled','imported_at'],
  documents:['id','name','text','size','mime','object_key','created_by','created_at','pages']
};
function requireString(value,name,max){if(typeof value!=='string'||value.length>max)throw Error('Invalid '+name);return value}
function requireNumber(value,name){if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid '+name);return value}
function rejectProjection(value){
  if(typeof value==='string'){if(/model_projection|\[(?:truncated|截断)\]/i.test(value))throw Error('Truncated or model-projection exports cannot be imported');return}
  if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)){if(/^(?:truncated|truncated_values|model_projection)$/i.test(key))throw Error('Truncated or model-projection exports cannot be imported');rejectProjection(item)}
}
function requireJSON(value,name,max){requireString(value,name,max);let parsed;try{parsed=JSON.parse(value);if(!parsed||typeof parsed!=='object')throw Error()}catch{throw Error('Invalid JSON '+name)}rejectProjection(parsed);return parsed}
export function validateExport(data){
  rejectProjection(data);
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!Object.hasOwn(definitions,k)))throw Error('Export must contain only users, learning_state, course_sources and documents');
  const result={};for(const [table,columns]of Object.entries(definitions)){
    const rows=data[table]||[];if(!Array.isArray(rows)||rows.length>100000)throw Error('Invalid table '+table);
    result[table]=rows.map(row=>{
      if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>!columns.includes(k)))throw Error('Unexpected columns in '+table);
      const normalized={...row};
      if(table==='users'){
        const id=requireString(row.id,'user id',40);if(!/^(?:administrator01|\d{6,20})$/.test(id))throw Error('Invalid account identifier');
        requireString(row.name,'name',80);normalized.class_name=requireString(row.class_name??'','class_name',120);if(!['student','admin'].includes(row.role)||row.role==='admin'&&id!=='administrator01')throw Error('Invalid role');
        normalized.password_hash=row.password_hash??null;if(normalized.password_hash!==null&&!/^pbkdf2-sha256\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(normalized.password_hash))throw Error('Invalid password hash');
        normalized.activated_at=row.activated_at??null;if(normalized.activated_at!==null)requireNumber(normalized.activated_at,'activated_at');
      }else if(table==='learning_state'){requireString(row.user_id,'user_id',40);requireJSON(row.data,'learning state',400000);requireNumber(row.updated_at,'updated_at')}
      else if(table==='course_sources'){requireString(row.id,'course id',100);requireString(row.title,'title',300);requireString(row.source_url,'source_url',2000);requireJSON(row.payload,'course payload',4000000);if(![0,1].includes(row.enabled))throw Error('Invalid enabled flag');requireString(row.imported_at,'imported_at',80)}
      else {if(!/^[a-f0-9-]{36}$/.test(row.id))throw Error('Invalid document id');requireString(row.name,'document name',180);requireString(row.text,'document text',400000);requireNumber(row.size,'document size');if(row.size>20*1024*1024)throw Error('Document too large');requireString(row.mime,'mime',200);if(row.object_key!=='materials/'+row.id)throw Error('Mismatched object key');requireString(row.created_by,'created_by',40);requireNumber(row.created_at,'created_at');normalized.pages=row.pages??'[]';if(!Array.isArray(requireJSON(normalized.pages,'pages',1500000)))throw Error('Document pages must be an array')}
      for(const column of columns)if(!Object.hasOwn(normalized,column))throw Error('Missing '+table+'.'+column);
      return Object.fromEntries(columns.map(column=>[column,normalized[column]]));
    });
  }return result;
}
export async function importData({inputFile,dataDirectory,objectsDirectory,acknowledgePasswordPepper=false}){
  const inputInfo=await stat(inputFile);if(inputInfo.size>100*1024*1024)throw Error('Export exceeds 100 MB');
  const data=validateExport(JSON.parse(await readFile(inputFile,'utf8')));
  if(data.users.some(u=>u.password_hash)&&!acknowledgePasswordPepper)throw Error('Activated accounts require the original AUTH_PEPPER. Confirm it before importing with --same-auth-pepper; hashes will not be reset.');
  const database=await openDatabase(dataDirectory,projectDirectory),copied=[];
  try{
    for(const table of Object.keys(definitions))if(database.sql.prepare('SELECT count(*) AS n FROM '+table).get().n)throw Error('Import requires an empty destination database; existing '+table+' records will not be overwritten');
    for(const document of data.documents){if(!objectsDirectory)throw Error('Document files require --objects-dir');const source=objectPath(objectsDirectory,document.object_key),destination=objectPath(dataDirectory,document.object_key),info=await stat(source);if(!info.isFile()||info.size!==document.size)throw Error('Missing or mismatched document file: '+document.id);await mkdir(path.dirname(destination),{recursive:true,mode:0o700});await copyFile(source,destination,1);copied.push(destination)}
    database.sql.exec('BEGIN IMMEDIATE');try{for(const [table,columns]of Object.entries(definitions)){const statement=database.sql.prepare('INSERT INTO '+table+' ('+columns.join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')');for(const row of data[table])statement.run(...columns.map(c=>row[c]))}database.sql.exec('COMMIT')}catch(error){database.sql.exec('ROLLBACK');throw error}
    return Object.fromEntries(Object.entries(data).map(([table,rows])=>[table,rows.length]));
  }catch(error){for(const filename of copied)await rm(filename,{force:true});throw error}finally{database.close()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),value=flag=>{const i=args.indexOf(flag);return i>=0?args[i+1]:undefined};
  if(!value('--file'))throw Error('Usage: node deployment/import-data.mjs --file private/export.json [--data-dir private/data] [--objects-dir private/old-store] [--same-auth-pepper]');
  const counts=await importData({inputFile:path.resolve(value('--file')),dataDirectory:path.resolve(value('--data-dir')||process.env.DATA_DIRECTORY||'private/data'),objectsDirectory:value('--objects-dir')?path.resolve(value('--objects-dir')):undefined,acknowledgePasswordPepper:args.includes('--same-auth-pepper')});console.log(JSON.stringify(counts));
}
