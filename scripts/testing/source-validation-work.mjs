/**
 * Measure actual cached-source validation work in doubling-size real Chromium/IndexedDB fixtures.
 * Genuine acquisition seeds durable heads/dependencies outside measurement; a new connection and
 * acquisition lifetime then handle clean restart or an ordinary unscoped resolved wave. No graph,
 * storage, lease, digest or validation behavior is replaced. This is not native startup timing.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {contributorBrowserBundle,contributorBrowserInitialize} from '../../tests/support/contributorBrowserFixture.mjs';
import {chromiumHarness} from '../../tests/support/browserTypeScript.mjs';
import {spawnNativeSync} from './obsidian/processTools.mjs';
import {createStartupResourceProbe} from './obsidian/startupResources.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),overrides={};
const ref=process.argv.find(/** Select an immutable committed source baseline. */ arg=>arg.startsWith('--baseline-ref='))?.split('=')[1];
const sizes=(process.argv.find(/** Keep scale explicit and bounded. */ arg=>arg.startsWith('--sizes='))?.split('=')[1]??'32,64,128').split(',').map(Number);
if(ref&&!/^[a-f0-9]{7,40}$/.test(ref))throw Error('Use an immutable commit hash');
if(!sizes.length||sizes.length>8||sizes.some(/** Refuse accidental huge fixture setup. */ size=>!Number.isSafeInteger(size)||size<2||size>4096))throw Error('Use 2–4096 owners per fixture');
const paths=['src/adapters/obsidian/sourceAcquisition.ts','src/index/SourceRepository.ts','src/adapters/obsidian/startupDiagnostics.ts'];
if(ref)for(const path of paths){const r=spawnNativeSync('git',['show',`${ref}:${path}`],{cwd:root,encoding:'utf8',timeout:10000});if(r.error||r.status!==0)throw Error('Baseline unavailable');overrides[path]=r.stdout;}
const source=Object.fromEntries(paths.map(/** Pin exactly the sources supplied to the browser bundle. */ path=>[path,createHash('sha256').update(overrides[path]??readFileSync(join(root,path))).digest('hex')]));
const browser=await chromiumHarness(await contributorBrowserBundle(['src/adapters/obsidian/startupDiagnostics.ts'],overrides)),results=[];
try{
 assert.equal(await browser.evaluate(contributorBrowserInitialize),true);
 assert.equal(await browser.evaluate(`window.sourceWorkProbeFactory=(${createStartupResourceProbe.toString()});true`),true);
 for(const count of sizes)for(const wave of [false,true]){
  const result=await browser.evaluate(`(/** Reopen genuine durable state and observe a complete restart inventory. */ async()=>{
   const M=sourceModules,name='validation-work-${count}-${wave}',f=await fixture(name);let cache,acquisition,probe;
   try{
    for(let n=0;n<${count};n++){
     const file=f.add('Note-'+n+'.md','Friends:: [[Note-'+((n+1)%${count})+']]\\n[Example](https://example.com/'+n+')',{aliases:['Alias-'+n]});
     f.metadata.get(file.path).links=[{link:'Note-'+((n+1)%${count}),position:{start:{line:0,offset:0},end:{line:0,offset:10}}}];
    }
    await f.acquire();ok(await f.acquisition.reconcile(),'Seed complete genuine dependency authority');
    f.acquisition.close();f.cache.close();
    cache=new M.KplexIndexedDbCache(name);ok(await cache.open(),'Reopen real IndexedDB');
    const diagnostics=new M.StartupDiagnostics();diagnostics.begin(true);
    acquisition=new M.ObsidianSourceAcquisition(f.app,cache,async text=>{f.parses.push(text);return M.parseBodyMetadata(text);},undefined,undefined,diagnostics);
    acquisition.start();
    const options={phase:()=>diagnostics.progress('source')?.phase??'initialization',now:()=>performance.now(),databaseName:dbName(name),detailed:true};
    const originalFileCache=f.app.metadataCache.getFileCache;
    probe=window.sourceWorkProbeFactory(options);
    probe.attach({sourceAcquisition:acquisition,indexedDb:cache});
    acquisition.metadataHost.dailyNotesSettings();
    await cache.sources.inspect('Note-0.md',[]);
    acquisition.metadataHost.dailyNotesSettings();
    equal(probe.snapshot().groups['initialization:host.dailyNotesSettings'].calls,2,'Host methods wrap exactly once, independently of request count');
    probe.stop();equal(f.app.metadataCache.getFileCache===originalFileCache,true,'Observer cleanup restores exact host method identity');
    probe=window.sourceWorkProbeFactory(options);probe.attach({sourceAcquisition:acquisition,indexedDb:cache});
    const before=f.reads.length,parses=f.parses.length;
    if(${wave})f.app.metadataCache.trigger('resolved');
    const at=performance.now(),ready=await acquisition.reconcile(),elapsedMs=performance.now()-at;
    ok(ready&&acquisition.hasSemanticDependencies(),'Actual source authority closes');
    const resources=probe.snapshot();
    return {owners:${count},resolvedWave:${wave},elapsedMs,ready,resources,source:acquisition.getCounters(),reads:f.reads.length-before,parses:f.parses.length-parses,diagnostics:diagnostics.snapshot()};
   }finally{probe?.stop();acquisition?.close();cache?.close();f.close();}
  })()`);
  assert.equal(result.ready,true);assert.equal(result.reads,0);assert.equal(result.parses,0);
  assert.equal(result.resources.activeTransactions,0);assert.equal(result.resources.pending,0);
  if(result.diagnostics.sessionWork)assert.deepEqual(result.diagnostics.sessionWork,{sourceInventoryPasses:1,fullBuildStarts:0,nodeCatalogStarts:0,completeSnapshotSaves:0,checkpointSaves:0});
  results.push(result);
 }
 const browserVersion=await browser.command('Browser.getVersion');
 const report={node:process.version,baselineRef:ref??null,source,
  driverSha256:createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),probeSha256:createHash('sha256').update(readFileSync(join(root,'scripts/testing/obsidian/startupResources.mjs'))).digest('hex'),
  browser:{product:browserVersion.product,jsVersion:browserVersion.jsVersion},method:'Genuine source restart in real IndexedDB; setup excluded. Doubling-size work counts, not native startup/CPU/battery timing.',results};
 if(process.env.KPLEX_BENCHMARK_REPORT)writeFileSync(process.env.KPLEX_BENCHMARK_REPORT,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(results.map(/** Keep console output compact; complete aggregate groups go to the report. */ row=>({owners:row.owners,resolvedWave:row.resolvedWave,elapsedMs:row.elapsedMs,source:row.source,transactions:Object.entries(row.resources.groups).filter(/** Count all store/mode selections. */ ([key])=>key.includes(':tx.')).reduce(/** Sum disjoint transaction buckets. */ (sum,[,value])=>sum+value.calls,0)}))));
}finally{await browser.cleanup();}
