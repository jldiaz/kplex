/**
 * Public URL search and scoped general-cache publication regressions using actual index/compiler
 * owners. Catalog deduplication cannot bypass requested eligibility, stale-source checks, ordinary
 * canonical refreshes or physical fallback. Scoped work counters exclude public search itself.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {contributorBrowserBundle} from './support/contributorBrowserFixture.mjs';
import {urlSearchPublicationFixture} from './support/urlSearchPublicationProbe.mjs';

const bundle=await contributorBrowserBundle(['src/index/GraphIndex.ts','src/index/GraphBuilder.ts']);

/** Supply current parsed native facts through the actual owner publisher, then expose one display boundary. */
async function publish(f,path,text,frontmatter={}){const record=f.add(path,text,frontmatter);await f.index.publishUrlOwner(record.file,record.body,f.index.urlOwnerEvents.get(path)??0,frontmatter,true);f.index.flushUrlPublication();return record;}
/** Public result identities retain ranking/order; do not normalize them into a set. */
const paths=(index,query,scope='visible')=>Array.from(index.search(query,100,scope),/** Compare exact semantic keys, not lowercased labels. */page=>page.path);

for(const mode of ['on-demand','eager']){
  test(`${mode}: flush avoids covered URL lookups while owner vocabulary and public eligibility remain`,/** A high-degree origin never needs a duplicate general search projection. */async()=>{
    const f=urlSearchPublicationFixture(bundle,mode),i=f.index,owners=64;
    try{
      for(let n=0;n<owners;n++){const record=f.add(`Owner-${n}.md`,`[Label ${n}](https://search.example/child/${n})`);await i.publishUrlOwner(record.file,record.body,0,undefined,true);}
      f.reset();i.flushUrlPublication();
      assert.equal(f.counts.coveredGets,0);assert.equal(f.counts.urlGets,0);
      assert(f.counts.gets<=owners);assert(f.counts.fromPairRows<=owners);
      assert.equal(i.searchEntryByPath.size,owners,'All body-owner entries remain; URL vocabulary has one catalog owner');
      assert.deepEqual(paths(i,'label 37'),['https://search.example/child/37']);
      assert.equal(i.urlSearchEntries.size,owners+1);
      assert.deepEqual(f.operations,{reads:0,parses:0});
    }finally{f.close();}
  });

  test(`${mode}: public aliases, prefix cache, visibility, physical fallback and URL retirement stay current`,/** Requested results remain independent of the general cache representation. */async()=>{
    const f=urlSearchPublicationFixture(bundle,mode),i=f.index,shared='https://search.example/shared',red='https://search.example/red',blue='https://search.example/blue';
    try{
      f.add('Cold physical.md','');await i.primePhysicalSearchCatalog();
      await publish(f,'Owner A.md',`[Red unique](${red}) [Shared first](${shared})`);
      await publish(f,'Owner B.md',`[Blue unique](${blue}) [Shared second](${shared})`);
      for(const scope of ['visible','vault-files']){
        assert.deepEqual(paths(i,'red unique',scope),[red]);assert.deepEqual(paths(i,'shared second',scope),[shared]);
        paths(i,'s',scope);assert.deepEqual(paths(i,'shared first',scope),[shared]);
      }
      assert.deepEqual(paths(i,'Cold physical','vault-files'),['Cold physical.md']);
      i.plugin.settings.showURLNodes=false;assert.deepEqual(paths(i,'red unique'),[]);assert.deepEqual(paths(i,'red unique','vault-files'),[red]);i.plugin.settings.showURLNodes=true;
      await publish(f,'Owner A.md',`[Fresh unique](https://search.example/fresh)`);
      assert.deepEqual(paths(i,'red unique'),[]);assert.deepEqual(paths(i,'shared first'),[]);assert.deepEqual(paths(i,'shared second'),[shared]);
      f.files.delete('Owner B.md');await i.retireUrlOwner('Owner B.md');i.flushUrlPublication();
      assert.deepEqual(paths(i,'shared second'),[]);assert.deepEqual(paths(i,'blue unique'),[]);
      await publish(f,'Owner B.md',`[Reinserted unique](${shared})`);
      assert.deepEqual(paths(i,'reinserted unique'),[shared]);assert.deepEqual(paths(i,'shared second'),[]);
      assert.deepEqual(f.operations,{reads:0,parses:0});
    }finally{f.close();}
  });

  test(`${mode}: catalog coverage does not grant eligibility after an unnotified metadata replacement`,/** Search must still call the production current-owner support checks when actually requested. */async()=>{
    const f=urlSearchPublicationFixture(bundle,mode),i=f.index,url='https://search.example/only';
    try{
      await publish(f,'Owner.md',`[Lonely unique](${url})`);assert.deepEqual(paths(i,'lonely unique'),[url]);
      f.metadata.set('Owner.md',{frontmatter:{changed:true}});
      assert(i.urlSearchEntries.has(url),'The old vocabulary entry is deliberately still present');
      assert.deepEqual(paths(i,'lonely unique'),[]);assert.deepEqual(paths(i,'lonely unique','vault-files'),[]);
      await publish(f,'Owner.md',`[Current unique](${url})`,{changed:true});assert.deepEqual(paths(i,'current unique'),[url]);
      assert.deepEqual(f.operations,{reads:0,parses:0});
    }finally{f.close();}
  });

  test(`${mode}: URL flush rebinds an existing noncanonical row without sweeping the general catalog`,/** Release an old displayed page through bounded row replacement rather than a broad array filter. */async()=>{
    const f=urlSearchPublicationFixture(bundle,mode),i=f.index,url='https://search.example/retained';
    try{
      await publish(f,'First.md',`[First unique](${url})`);
      i.patchSearchIndex(new Set([url]));const entry=i.searchEntryByPath.get(url),old=entry?.page;
      assert(old);assert.equal(i.state.pages.has(url),false,'This entry came from a readable URL overlay, not a canonical fallback');
      const entries=i.searchEntries,descriptor=Object.getOwnPropertyDescriptor(entries,'filter');
      entries.filter=/** Covered-row refresh must not turn a tiny URL update into a whole general-catalog pass. */()=>{throw Error('Covered URL refresh swept the general catalog');};
      try{await publish(f,'Second.md',`[Second unique](${url})`);}finally{if(descriptor)Object.defineProperty(entries,'filter',descriptor);else delete entries.filter;}
      assert.equal(i.searchEntryByPath.get(url),entry);assert.equal(entry.page,i.urlSearchEntries.get(url).page);
      assert.equal(i.searchEntries.some(/** No obsolete displayed page remains reachable through the general catalog. */entry=>entry.page===old),false);
      assert.deepEqual(paths(i,'second unique'),[url]);assert.deepEqual(paths(i,'first unique'),[url]);
    }finally{f.close();}
  });

  test(`${mode}: canonical fallback entries remain while ordinary patches keep their original refresh`,/** Only the URL flush skips duplicate vocabulary; neither canonical identity nor the default caller changes. */async()=>{
    const f=urlSearchPublicationFixture(bundle,mode),i=f.index,url='https://search.example/canonical';
    try{
      const builder=new f.M.GraphBuilder(i.plugin,i.app,new Map(),i.metadataParser,i.indexedDb,/** Fixed fixture lifetime. */()=>true),canonical=builder.createPage({path:url,url,name:'previous-only-token',aliases:['previous-only-token']});
      builder.addPage(i.state,canonical);i.rebuildSearchIndex();const entry=i.searchEntryByPath.get(url);
      await publish(f,'Owner.md',`[current-only-token](${url})`);
      assert.equal(i.get(url),canonical);assert.equal(i.searchEntryByPath.get(url),entry);assert.equal(entry.name,'current-only-token','Canonical fallback vocabulary stays current without another support lookup');
      assert.deepEqual(paths(i,'previous-only-token'),[]);assert.deepEqual(paths(i,'current-only-token'),[url]);
      entry.name='stale-derived-token';i.patchSearchIndex(new Set([url]));assert.equal(entry.name,'current-only-token','Ordinary/default callers still refresh canonical vocabulary');
      f.files.delete('Owner.md');await i.retireUrlOwner('Owner.md');i.flushUrlPublication();assert.deepEqual(paths(i,'current-only-token'),[]);
      await publish(f,'Owner.md',`[returned-only-token](${url})`);assert.deepEqual(paths(i,'returned-only-token'),[url]);
    }finally{f.close();}
  });
}
