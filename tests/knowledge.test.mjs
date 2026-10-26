import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=f=>JSON.parse(readFileSync('lib/'+f+'.json','utf8'));
const book=load('textbook'),course=load('course'),graph=load('textbook-map'),cards=load('knowledge-cards');
test('all graph relationships and knowledge cards have valid source page references',()=>{
  assert.equal(graph.nodes.filter(n=>n.kind==='section').length,51);assert.equal(new Set(graph.nodes.map(n=>n.id)).size,88);assert.equal(new Set(cards.map(c=>c.id)).size,55);
  for(const edge of graph.edges){assert(graph.nodes.some(n=>n.id===edge.from));assert(graph.nodes.some(n=>n.id===edge.to));assert(edge.label);assert(edge.pages.length);for(const p of edge.pages)assert(book.pages.some(x=>x.pageNumber===p&&x.printedPage&&!x.alternate))}
  for(const c of cards){assert(c.definition&&c.example&&c.tip&&c.question);assert(c.chapter>=0&&c.chapter<6);assert(c.sources.length);for(const s of c.sources){assert((s.kind==='textbook'?book:course).pages.some(p=>p.id===s.pageId),c.title)}}
  assert(graph.edges.some(e=>e.from==='cnn'&&e.to==='s24'));assert(!graph.edges.some(e=>e.from==='gan'&&e.to==='s24'));
  for(const c of cards.filter(c=>c.id<12))assert([0,1,4,5,6,7,8,9,10,11].includes(c.id));
});
