export function validateDocumentIndex(value){
  if(!Array.isArray(value)||!value.length||value.length>200)throw new Error('资料应包含 1–200 页，请将较长文件拆分后导入');
  let length=0;const pages=value.map((p,i)=>{if(!p||typeof p.text!=='string'||p.text.length>100000)throw new Error('识别文字格式错误');length+=p.text.length;return {pageNumber:i+1,title:typeof p.title==='string'?p.title.slice(0,180):'第 '+(i+1)+' 页',text:p.text,method:p.method==='ocr'?'ocr':'text'}});
  if(length>400000||new TextEncoder().encode(JSON.stringify(pages)).length>1500000)throw new Error('文字内容过多，请拆分文件后导入');
  return {pages,text:pages.map(p=>p.text).join('\n\n')};
}
