import source from './course.json' with {type:'json'};
const initialized=new WeakMap();
export const coursePageIds=new Set(source.pages.map(page=>page.id));
export async function getImportedCourse(DB){
  let promise=initialized.get(DB);
  if(!promise){promise=DB.prepare('INSERT OR IGNORE INTO course_sources (id,title,source_url,payload,enabled,imported_at) VALUES (?,?,?,?,1,?)').bind(source.id,source.title,source.sourceUrl,JSON.stringify(source),source.importedAt).run();initialized.set(DB,promise)}
  try{await promise}catch(error){initialized.delete(DB);throw error}
  const row=await DB.prepare('SELECT payload,enabled FROM course_sources WHERE id=?').bind(source.id).first();
  return {course:JSON.parse(row.payload),enabled:!!row.enabled};
}
export async function setCourseEnabled(DB,enabled){await getImportedCourse(DB);await DB.prepare('UPDATE course_sources SET enabled=? WHERE id=?').bind(enabled?1:0,source.id).run()}
