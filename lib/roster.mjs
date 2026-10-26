import roster from './roster.json' with { type: 'json' };
const initialized=new WeakMap();
export async function ensureRoster(DB){
  let promise=initialized.get(DB);
  if(!promise){
    promise=(async()=>{
      for(let i=0;i<roster.length;i+=30)await DB.batch(roster.slice(i,i+30).map(r=>DB.prepare("INSERT OR IGNORE INTO users (id,name,class_name,role) VALUES (?,?,?,'student')").bind(r.studentId,r.name,r.className)));
    })();
    initialized.set(DB,promise);
  }
  try{await promise}catch(error){initialized.delete(DB);throw error}
}
