'use strict';
// Reader preferences contain no account or textbook data.
let ebookFont=18,ebookTocOpen=false,ebookTheme='paper';
// Page 38 is transcribed from the supplementary page supplied by the teacher.
const ebookPage38=`抽象特征学习：深度神经网络的秘密
深度神经网络之所以如此强大，是因为它可以通过层次性结构逐渐提取抽象特征。以下图所示的卷积神经网络为例，网络低层学到了一些简单的线条，高层学到了一些有代表性的图案。这说明网络可以逐层提取特征。越到高层学到的特征越具有全局性，意义越明确，代表性越强，这种特征称为“高级特征”。
有趣的是，深度神经网络的逐层处理方式和人类的信息处理方式很相似。例如，人们发现卷积神经网络的特征提取方式和人脑中的视觉处理过程有很强的相似性。
高级特征具有更强的不变性。以人脸识别为例，我们把一张人脸图片加入各种变动，如缩放、旋转、染色等，这时低层特征（如线条、纹理等）会发生显著变化，但人脸还是人脸，“人脸”这一高级特征并不会发生变化。这种不变性对人脸识别非常重要。
深度神经网络与现代人工智能
深度神经网络兴起之后，在机器视觉、机器听觉、自然语言处理、机器人等众多领域取得极大成功。现在我们知道，辛顿当初提出的预训练方法并不是必要的，只要数据量足够大，计算资源足够丰富，就可以成功训练一个强大的深度神经网络模型。从这个角度上看，与其说是深度学习多么强大，不如说是大量数据的积累和计算机性能的提高使得大规模机器学习成为可能。
最后，资源共享成为研究界的共识，出现了大量公开的代码、数据和论文。这些共享资源的出现极大促进了技术交流与进步，为当前人工智能浪潮打上了独特的历史烙印。
思考与讨论
在第3节中，我们学习到合作是人类智能开始飞跃的起点。当前深度神经网络的发展也离不开合作与共享。这对你的学习有什么启发？
实践设计：在教师的指导下登录 CNN Explainer 网站，学习卷积神经网络如何进行层次性特征提取与决策。
视频资源
什么是深度学习？`;
function ebookPrepareTextbook(book){if(!book)return book;for(const p of book.pages){if(p.pageNumber===38&&!p.alternate){p.originalText=p.text;p.text=ebookPage38}}return book}
try{const p=JSON.parse(localStorage.getItem('study-ebook-preferences')||'{}');if([16,18,20,22,24,26].includes(p.font))ebookFont=p.font;if(['paper','night'].includes(p.theme))ebookTheme=p.theme}catch{}
function ebookPreferences(){try{localStorage.setItem('study-ebook-preferences',JSON.stringify({font:ebookFont,theme:ebookTheme}))}catch{}}
function ebookTypography(change){ebookFont=Math.min(26,Math.max(16,ebookFont+change));ebookPreferences();const r=document.querySelector('.ebook-reader');if(r)r.style.setProperty('--ebook-font',ebookFont+'px');const label=document.querySelector('#ebook-font-label');if(label)label.textContent=ebookFont+'px'}
function ebookSetTheme(){ebookTheme=ebookTheme==='paper'?'night':'paper';ebookPreferences();document.querySelector('.ebook-reader')?.setAttribute('data-theme',ebookTheme);const b=document.querySelector('#ebook-theme');if(b){b.textContent=ebookTheme==='night'?'☀ 日间':'◐ 夜间';b.setAttribute('aria-pressed',String(ebookTheme==='night'))}}
function ebookToggleToc(){ebookTocOpen=!ebookTocOpen;document.querySelector('.ebook-reader')?.classList.toggle('toc-open',ebookTocOpen);document.querySelector('#ebook-toc-toggle')?.setAttribute('aria-expanded',String(ebookTocOpen))}
function ebookGo(id){ebookTocOpen=false;openTextbook(id)}
function ebookJump(value){const number=Number(value),pages=textbook?.pages.filter(p=>!p.alternate)||[];if(!Number.isInteger(number)||number<1||number>pages.length){toast('请输入 1–'+pages.length+' 之间的电子书页码');return}ebookGo(pages[number-1].id)}
function ebookMove(delta){const pages=textbook?.pages.filter(p=>!p.alternate)||[],index=pages.findIndex(p=>p.id===bookPage);if(index+delta>=0&&index+delta<pages.length)ebookGo(pages[index+delta].id)}
async function ebookFullscreen(){const reader=document.querySelector('.ebook-reader');if(!document.fullscreenEnabled){toast('当前浏览器不支持全屏，可使用横屏阅读');return}try{if(document.fullscreenElement)await document.exitFullscreen();else await reader.requestFullscreen()}catch{toast('暂时无法进入全屏，请使用浏览器全屏功能')}}
function ebookOpenOriginal(){const panel=document.querySelector('#ebook-original');panel.open=true;loadTextbookImage(bookPage);panel.scrollIntoView({behavior:'smooth',block:'start'})}
function ebookReadingLines(page){
 const boxes=page.originalText?[]:page.boxes||[],rows=[];let offset=0;
 for(const raw of (page.text||'').split('\n')){const text=raw.trim(),start=offset+raw.indexOf(text);offset+=raw.length+1;if(!text)continue;const box=boxes.find(b=>b[0]===start);rows.push({text,box})}
 const scales=rows.filter(r=>r.box&&(r.text.match(/[\u4e00-\u9fff]/g)||[]).length>=15).map(r=>r.box[4]/r.text.length).sort((a,b)=>a-b);
 const bodyScale=scales[Math.floor(scales.length/2)]||1.6,heights=rows.filter(r=>r.box&&(r.text.match(/[\u4e00-\u9fff]/g)||[]).length>=15).map(r=>r.box[5]).sort((a,b)=>a-b),bodyHeight=heights[Math.floor(heights.length/2)]||1.7;
 for(const row of rows)row.heading=['思考与讨论','图灵测试','百年影响','图灵奖','深度神经网络与现代人工智能','视频资源'].includes(row.text)||row.text.length<=24&&/[\u4e00-\u9fff]/.test(row.text)&&!/[，。！？；,.;!?）)]/.test(row.text)&&row.box&&row.box[4]/row.text.length>bodyScale*1.18&&row.box[5]>=bodyHeight*1.08;
 const ordered=[];let chunk=[];
 const flush=()=>{let best=null;for(const cut of [35,40,45,49,50,55,60,65]){const left=chunk.filter(r=>r.box&&r.box[2]+r.box[4]<=cut+1),right=chunk.filter(r=>r.box&&r.box[2]>=cut-1);if(left.length<3||right.length<3)continue;const overlap=Math.min(Math.max(...left.map(r=>r.box[3])),Math.max(...right.map(r=>r.box[3])))-Math.max(Math.min(...left.map(r=>r.box[3])),Math.min(...right.map(r=>r.box[3]))),crossed=chunk.length-left.length-right.length;if(overlap>3&&(!best||crossed<best.crossed))best={cut,crossed}}if(best)chunk.sort((a,b)=>Number((a.box?.[2]||0)>=best.cut-1)-Number((b.box?.[2]||0)>=best.cut-1)||(a.box?.[3]||0)-(b.box?.[3]||0));ordered.push(...chunk);chunk=[]};
 for(const row of rows){if(row.heading||row.box&&row.box[2]<45&&row.box[2]+row.box[4]>56){flush();ordered.push(row)}else chunk.push(row)}flush();return ordered;
}
function ebookMarkup(page){
 const lines=ebookReadingLines(page);
 const groups=[];let paragraph='';
 const flush=()=>{if(paragraph){groups.push('<p>'+highlightText(paragraph)+'</p>');paragraph=''}};
 for(const row of lines){const line=row.text;
  if(line===String(page.pageNumber)||line==='人工智能通识'||line.replace(/^[\d\s]+/,'')===page.title)continue;
  const heading=row.heading;
  if(heading){flush();groups.push('<h2>'+highlightText(line)+'</h2>');continue}
  if(paragraph&&/[a-zA-Z0-9]$/.test(paragraph)&&/^[a-zA-Z0-9]/.test(line))paragraph+=' ';
  paragraph+=line;
  if(/[。！？!?；;：:]$/.test(line)||paragraph.length>520)flush();
 }
 flush();return groups.join('')||'<p class="ebook-empty">本页以图表或图片为主，可展开教材原页查看。</p>';
}
function ebookReader(p){
 const pages=textbook.pages.filter(x=>!x.alternate),index=pages.findIndex(x=>x.id===p.id),groups=[...new Set(pages.map(x=>x.group))];
 const previous=pages[Math.max(0,index-1)],next=pages[Math.min(pages.length-1,index+1)];
 return `<section class="ebook-reader ${ebookTocOpen?'toc-open':''}" data-theme="${ebookTheme}" style="--ebook-font:${ebookFont}px" aria-label="教材电子书阅读器">
 <div class="ebook-toolbar"><button class="ebook-tool" onclick="openTextbook(null)" aria-label="退出电子书阅读">← <span>返回</span></button><div class="ebook-title"><strong>${esc(textbook.title)}</strong><small>电子书 · ${esc(p.label)}</small></div><button class="ebook-tool" onclick="ebookFullscreen()" aria-label="全屏阅读">⛶</button></div>
 <div class="ebook-controls"><button id="ebook-toc-toggle" class="ebook-tool" onclick="ebookToggleToc()" aria-expanded="${ebookTocOpen}" aria-controls="ebook-toc">☰ 目录</button><form class="ebook-jump" onsubmit="event.preventDefault();ebookJump(this.elements.page.value)"><label for="ebook-page">电子书页码</label><input id="ebook-page" name="page" type="number" min="1" max="${pages.length}" value="${index+1}" aria-label="电子书页码"><span>/ ${pages.length}</span><button class="ebook-tool" type="submit">跳转</button></form><div class="ebook-type"><button class="ebook-tool" onclick="ebookTypography(-2)" aria-label="缩小字号">A−</button><span id="ebook-font-label">${ebookFont}px</span><button class="ebook-tool" onclick="ebookTypography(2)" aria-label="放大字号">A＋</button><button class="ebook-tool" id="ebook-theme" onclick="ebookSetTheme()" aria-pressed="${ebookTheme==='night'}">${ebookTheme==='night'?'☀ 日间':'◐ 夜间'}</button></div></div>
 <div class="ebook-layout"><aside class="ebook-toc" id="ebook-toc" aria-label="电子书目录"><div class="ebook-toc-head"><strong>全书目录</strong><button class="ebook-tool" onclick="ebookToggleToc()" aria-label="关闭目录">×</button></div>${groups.map(g=>`<details ${g===p.group?'open':''}><summary>${esc(g)}</summary>${pages.filter(x=>x.group===g).map(x=>`<button class="ebook-toc-page ${p.id===x.id?'current':''}" ${p.id===x.id?'aria-current="page"':''} onclick="ebookGo('${x.id}')"><span>${esc(x.shortLabel)}</span><span>${esc(x.title)}</span></button>`).join('')}</details>`).join('')}</aside>
 <div class="ebook-reading"><article class="ebook-paper" aria-labelledby="ebook-heading"><div class="ebook-running-head"><span>${esc(p.group)}</span><span>${esc(p.label)}</span></div><h1 id="ebook-heading">${esc(p.title)}</h1><p class="ebook-edition">文字识别版 · 可选中文字与摘录</p><div class="ebook-prose">${ebookMarkup(p)}</div><div class="ebook-paper-end"><span>知序 · 人工智能通识</span><span>${esc(p.shortLabel)}</span></div></article>
 <div class="ebook-page-nav"><button class="ebook-tool" ${index<=0?'disabled':''} onclick="ebookGo('${previous.id}')">← 上一页</button><span>${index+1} / ${pages.length}</span><button class="ebook-tool" ${index===pages.length-1?'disabled':''} onclick="ebookGo('${next.id}')">下一页 →</button></div>
 <p class="ebook-source-note">正文由教材图片识别并重新排版，可能存在错字。图表、公式和有疑问的文字请<a href="#" onclick="event.preventDefault();ebookOpenOriginal()">核对教材原页</a>。</p>
 <details class="ebook-original" id="ebook-original" ontoggle="if(this.open)loadTextbookImage('${p.id}')"><summary>查看教材原页与图表 · ${esc(p.label)}</summary><div class="textbook-image-wrap"><p id="book-image-status" role="status">展开后载入原页…</p><div class="textbook-image-stage"><img id="book-image" alt="${esc(p.label)}：${esc(p.title)}" width="${p.width}" height="${p.height}" hidden><div id="book-hit-overlay" class="book-hit-overlay" hidden>${bookImageHighlights(p)}</div></div><a id="book-zoom" class="text-link" hidden target="_blank" rel="noopener">单独放大原页 ↗</a></div></details>
 <div class="ebook-study">${readerStudyPanel('textbook',p.id)}</div></div></div></section>`;
}
document.addEventListener('keydown',event=>{if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||!document.querySelector('.ebook-reader')||event.target.closest('input,textarea,select,button,a,[contenteditable=true]'))return;if(event.key==='ArrowRight'){event.preventDefault();ebookMove(1)}if(event.key==='ArrowLeft'){event.preventDefault();ebookMove(-1)}});
