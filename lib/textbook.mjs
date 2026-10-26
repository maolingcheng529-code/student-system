import source from './textbook.json' with {type:'json'};
import knowledgeGraph from './textbook-map.json' with {type:'json'};
const initialized=new WeakMap();
export const textbookPageIds=new Set(source.pages.map(page=>page.id));
export async function getImportedTextbook(DB){
  let promise=initialized.get(DB);
  if(!promise){promise=DB.prepare('INSERT OR IGNORE INTO course_sources (id,title,source_url,payload,enabled,imported_at) VALUES (?,?,?,?,1,?)').bind(source.id,source.title,'administrator-import:textbook-images',JSON.stringify(source),source.importedAt).run();initialized.set(DB,promise)}
  try{await promise}catch(error){initialized.delete(DB);throw error}
  const row=await DB.prepare('SELECT payload,enabled FROM course_sources WHERE id=?').bind(source.id).first();
  return {textbook:{...JSON.parse(row.payload),knowledgeGraph},enabled:!!row.enabled};
}
export async function setTextbookEnabled(DB,enabled){await getImportedTextbook(DB);await DB.prepare('UPDATE course_sources SET enabled=? WHERE id=?').bind(enabled?1:0,source.id).run()}
