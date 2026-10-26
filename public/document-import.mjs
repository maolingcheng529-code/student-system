const decoder=new TextDecoder('utf-8',{fatal:true});
const textOf=xml=>Array.from(xml.getElementsByTagNameNS('*','t')).map(n=>n.textContent).join('\n');
const parseXML=text=>{const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('课件内部 XML 无法读取');return doc};
export async function extractDocument(file,progress=()=>{}){
  if(file.size>20*1024*1024)throw Error('文件不能超过 20 MB');
  const extension=file.name.split('.').pop().toLowerCase();let worker=null;
  const recognize=async image=>{if(!worker){progress('正在准备本机文字识别…');const {default:{createWorker}}=await import('/vendor/importers/tesseract.mjs');worker=await createWorker('chi_sim+eng',1,{workerPath:'/vendor/importers/ocr-worker.js',corePath:'/vendor/tesseract-core',langPath:'/vendor/tessdata',logger:m=>{if(m.status==='recognizing text')progress('正在识别文字 '+Math.round(m.progress*100)+'%')}})}return (await worker.recognize(image)).data.text.trim()};
  let pages=[],upload=file;
  try{
    if(['txt','md'].includes(extension)){const text=decoder.decode(await file.arrayBuffer());if(!text.trim())throw Error('文件没有文字');pages=[{title:file.name,text,method:'text'}]}
    else if(['jpg','jpeg','png','webp'].includes(extension)){
      progress('正在压缩图片…');const bitmap=await createImageBitmap(file);const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.83));if(!blob)throw Error('图片无法压缩');upload=new File([blob],file.name.replace(/\.[^.]+$/,'.webp'),{type:'image/webp'});pages=[{title:file.name,text:await recognize(canvas),method:'ocr'}];canvas.width=canvas.height=0;
    }
    else if(extension==='pdf'){
      const pdfjs=await import('/vendor/importers/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/importers/pdf.worker.mjs';const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
      try{if(pdf.numPages>200)throw Error('单份资料最多 200 页，请拆分后导入');for(let n=1;n<=pdf.numPages;n++){progress('读取 PDF 第 '+n+' / '+pdf.numPages+' 页');const page=await pdf.getPage(n);const content=await page.getTextContent();let text=content.items.map(i=>i.str+(i.hasEOL?'\n':' ')).join('');let method='text';const ops=await page.getOperatorList();const imageOps=[pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject,pdfjs.OPS.paintImageMaskXObject];if(text.trim().length<40||ops.fnArray.some(op=>imageOps.includes(op))){const base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2,2000/Math.max(base.width,base.height))});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;const recognized=await recognize(canvas);const existing=text.replace(/\s+/g,'');text+='\n'+recognized.split('\n').filter(line=>line.trim()&&!existing.includes(line.replace(/\s+/g,''))).join('\n');method='ocr';canvas.width=canvas.height=0}pages.push({title:'第 '+n+' 页',text:text.trim(),method});page.cleanup()}}finally{await pdf.destroy()}
    }
    else if(extension==='pptx'){
      const {unzipSync}=await import('/vendor/importers/fflate.mjs');let expanded=0;const zip=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:entry=>{if(!/^(ppt\/.*\.(xml|rels)|ppt\/media\/.*\.(png|jpe?g|webp|bmp|gif))$/i.test(entry.name))return false;expanded+=entry.originalSize;if(entry.originalSize>30*1024*1024||expanded>120*1024*1024)throw Error('课件解压后过大，请拆分');return true}});
      const xmlFile=path=>zip[path]?parseXML(new TextDecoder().decode(zip[path])):null;
      const relsFor=path=>{const parts=path.split('/'),file=parts.pop();return xmlFile(parts.join('/')+'/_rels/'+file+'.rels')};
      const resolvePath=(file,target)=>new URL(target,'https://archive/'+file).pathname.slice(1);
      const presentation=xmlFile('ppt/presentation.xml'),relations=relsFor('ppt/presentation.xml');const mapping=new Map(Array.from(relations?.getElementsByTagName('Relationship')||[]).map(r=>[r.getAttribute('Id'),resolvePath('ppt/presentation.xml',r.getAttribute('Target'))]));
      let slides=Array.from(presentation?.getElementsByTagNameNS('*','sldId')||[]).map(n=>mapping.get(n.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'))).filter(Boolean);
      if(!slides.length)slides=Object.keys(zip).filter(path=>/^ppt\/slides\/slide\d+\.xml$/.test(path)).sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1]));
      if(slides.length>200)throw Error('单份课件最多 200 页，请拆分');const images=new Map();
      for(let i=0;i<slides.length;i++){progress('提取课件第 '+(i+1)+' / '+slides.length+' 页');const path=slides[i],xml=xmlFile(path);let text=textOf(xml),method='text';const rels=relsFor(path);
        for(const rel of Array.from(rels?.getElementsByTagName('Relationship')||[])){if(rel.getAttribute('TargetMode')==='External')continue;const target=resolvePath(path,rel.getAttribute('Target'));if(/\/notesSlide$/.test(rel.getAttribute('Type'))&&xmlFile(target))text+='\n讲者备注：\n'+textOf(xmlFile(target));if(/\/image$/.test(rel.getAttribute('Type'))&&zip[target]){method='ocr';if(!images.has(target))images.set(target,await recognize(new Blob([zip[target]])));const extra=images.get(target);if(extra)text+='\n图中文字：\n'+extra}}
        pages.push({title:text.split('\n').find(t=>t.trim())?.slice(0,100)||'幻灯片 '+(i+1),text:text.trim(),method});
      }
    }
    else if(extension==='ppt')throw Error('旧版 PPT 请先另存为 PPTX 后上传，以保留正确的幻灯片页码');
    else throw Error('支持 PDF、PPTX、TXT、Markdown 和教材图片');
    if(!pages.length)throw Error('没有读取到资料页');if(pages.reduce((sum,p)=>sum+p.text.length,0)>400000)throw Error('文字过多，请拆分文件后导入');return {file:upload,pages:pages.map((p,i)=>({...p,pageNumber:i+1}))};
  }finally{if(worker)await worker.terminate()}
}

