const encoder=new TextEncoder();
export const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
export const randomHex=(size=32)=>hex(crypto.getRandomValues(new Uint8Array(size)));
export async function digest(value){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)))}
export function equal(a,b){let result=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)result|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return result===0}
export async function hashPassword(password,pepper,salt=randomHex(16)){
  if(!pepper)throw new Error('Password configuration unavailable');
  const key=await crypto.subtle.importKey('raw',encoder.encode(password+'\0'+pepper),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},key,256);
  return `pbkdf2-sha256$100000$${salt}$${hex(bits)}`;
}
export async function verifyPassword(password,stored,pepper){
  if(typeof stored!=='string'||!/^pbkdf2-sha256\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(stored))return false;
  return equal(await hashPassword(password,pepper,stored.split('$')[2]),stored);
}
