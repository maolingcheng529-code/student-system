import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {timingSafeEqual} from 'node:crypto';
import {handleAPI} from '../lib/api.mjs';
import {openDatabase,diskBucket} from './storage.mjs';

const projectDirectory=fileURLToPath(new URL('../',import.meta.url));
const contentTypes={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.wasm':'application/wasm','.gz':'application/gzip','.bin':'application/octet-stream','.woff2':'font/woff2'};
const sameSecret=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right)};
function headersFrom(req,proxySecret){
  const headers=new Headers();for(const [name,value]of Object.entries(req.headers)){if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(', '):value)}
  const authenticatedProxy=proxySecret&&sameSecret(headers.get('x-study-proxy-token'),proxySecret),proxyIP=headers.get('x-study-client-ip');
  headers.delete('cf-connecting-ip');headers.delete('oai-authenticated-user-id');headers.delete('x-study-proxy-token');headers.delete('x-study-client-ip');headers.delete('forwarded');headers.delete('x-forwarded-host');headers.delete('x-forwarded-proto');headers.delete('x-forwarded-for');
  headers.set('cf-connecting-ip',authenticatedProxy&&proxyIP&&/^[a-fA-F0-9:.]{1,64}$/.test(proxyIP)?proxyIP:req.socket.remoteAddress||'unknown');
  return headers;
}
async function requestBody(req,limit){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit){const error=Error('Request too large');error.status=413;throw error}chunks.push(chunk)}return Buffer.concat(chunks)}
async function sendWebResponse(res,response){res.statusCode=response.status;for(const [name,value]of response.headers)if(name!=='set-cookie')res.setHeader(name,value);const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);if(response.body)await pipeline(Readable.fromWeb(response.body),res);else res.end()}

export async function startServer(options={}){
  const environment=options.environment||process.env;
  const publicOrigin=new URL(options.publicOrigin||environment.PUBLIC_ORIGIN||'http://localhost:8080');
  if(!['http:','https:'].includes(publicOrigin.protocol)||publicOrigin.pathname!=='/'||publicOrigin.username||publicOrigin.password||publicOrigin.search||publicOrigin.hash)throw Error('PUBLIC_ORIGIN must be a plain http(s) origin');
  if(publicOrigin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(publicOrigin.hostname))throw Error('A public deployment requires an HTTPS PUBLIC_ORIGIN');
  if(!environment.AUTH_PEPPER||!environment.ADMIN_PASSWORD_HASH)throw Error('AUTH_PEPPER and ADMIN_PASSWORD_HASH are required');
  if(environment.AUTH_PEPPER.length<32)throw Error('AUTH_PEPPER must contain at least 32 characters');
  if(!/^pbkdf2-sha256\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(environment.ADMIN_PASSWORD_HASH))throw Error('ADMIN_PASSWORD_HASH has an invalid format');
  if(environment.TEXTBOOK_IMAGE_KEY&&!/^[a-f0-9]{64}$/.test(environment.TEXTBOOK_IMAGE_KEY))throw Error('TEXTBOOK_IMAGE_KEY must contain 64 hexadecimal characters');
  if(environment.TRUST_PROXY_SECRET&&environment.TRUST_PROXY_SECRET.length<32)throw Error('TRUST_PROXY_SECRET must contain at least 32 characters');
  const dataDirectory=path.resolve(options.dataDirectory||environment.DATA_DIRECTORY||path.join(projectDirectory,'private/data'));
  const publicDirectory=await realpath(path.join(projectDirectory,'public')),shell=await readFile(path.join(projectDirectory,'deployment/index.html'));
  const database=await openDatabase(dataDirectory,projectDirectory),runtime={DB:database.DB,BUCKET:diskBucket(dataDirectory),AUTH_PEPPER:environment.AUTH_PEPPER,ADMIN_PASSWORD_HASH:environment.ADMIN_PASSWORD_HASH,TEXTBOOK_IMAGE_KEY:environment.TEXTBOOK_IMAGE_KEY,DEEPSEEK_API_KEY:environment.DEEPSEEK_API_KEY,DEEPSEEK_MODEL:environment.DEEPSEEK_MODEL};
  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
    try{
      if(!req.url?.startsWith('/')||req.url.startsWith('//')){res.writeHead(400);res.end();return}
      const parsed=new URL(req.url,publicOrigin),pathname=decodeURIComponent(parsed.pathname);
      if(pathname.includes('\0')||pathname.includes('\\')){res.writeHead(400);res.end();return}
      if(parsed.pathname==='/api'||parsed.pathname.startsWith('/api/')){
        const declaredSize=Number(req.headers['content-length']||0);if(declaredSize>22*1024*1024){res.writeHead(413);res.end('Request too large');return}
        const headers=headersFrom(req,environment.TRUST_PROXY_SECRET),body=['GET','HEAD'].includes(req.method)?undefined:await requestBody(req,22*1024*1024);
        const request=new Request(new URL(parsed.pathname+parsed.search,publicOrigin),{method:req.method,headers,body});
        await sendWebResponse(res,await handleAPI(request,runtime));return;
      }
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return}
      if(pathname==='/healthz'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:'ok');return}
      if(pathname==='/'||pathname==='/index.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:shell);return}
      if(pathname.split('/').some(part=>part==='.'||part==='..'||part.startsWith('.'))){res.writeHead(404);res.end();return}
      const candidate=path.resolve(publicDirectory,'.'+pathname);if(!candidate.startsWith(publicDirectory+path.sep)){res.writeHead(404);res.end();return}
      let filename,info;try{filename=await realpath(candidate);info=await stat(filename)}catch(error){if(['ENOENT','ENOTDIR'].includes(error.code)){res.writeHead(404);res.end();return}throw error}
      if(!filename.startsWith(publicDirectory+path.sep)||!info.isFile()){res.writeHead(404);res.end();return}
      res.writeHead(200,{'Content-Type':contentTypes[path.extname(filename).toLowerCase()]||'application/octet-stream','Content-Length':info.size,'Cache-Control':pathname.startsWith('/textbook-assets/')||pathname.startsWith('/vendor/')?'public, max-age=86400':'no-cache'});
      if(req.method==='HEAD')res.end();else await pipeline(createReadStream(filename),res);
    }catch(error){if(res.headersSent){res.destroy();return}res.writeHead(error.status||500,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:error.status===413?'请求内容过大':'服务暂时不可用'}));if(!error.status)console.error('Request failed:',error.name)}
  });
  server.requestTimeout=60000;server.headersTimeout=20000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(options.port??Number(environment.PORT||8080),options.host||environment.HOST||'127.0.0.1',resolve)});
  return {server,dataDirectory,origin:publicOrigin.origin,async close(){await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));database.close()}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const application=await startServer();console.log('Study server listening; public origin: '+application.origin);
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>application.close().then(()=>process.exit(0)));
}
