/**
 * Disposable-vault startup acceptance: exact main.js staging, genuine complete-graph preparation,
 * vault-window application reloads and aggregate observation. Never accepts a personal vault.
 * Existing CLI process deadlines and renderer throttling remain unchanged. Settings are backed
 * up before preparation and restored explicitly; no operation can target a personal vault.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { arch, cpus, release, totalmem } from 'node:os';
import { obsidianCliExecutable, spawnNativeSync } from './processTools.mjs';
import { validateTarget } from './runner.mjs';
import { startupCacheIdentity } from './startupCacheIdentity.mjs';
import { startupRetainedMemory } from './startupRetainedMemory.mjs';
import { createStartupResourceProbe } from './startupResources.mjs';

const root=resolve(fileURLToPath(new URL('../../..',import.meta.url))),vault=process.env.KPLEX_TEST_VAULT_NAME;
if(!['kplex-test','kplex-test-small'].includes(vault)) throw Error('Only the two explicitly authorized disposable vaults are accepted');
const target=validateTarget({vaultName:vault,vaultPath:process.env.KPLEX_TEST_VAULT_PATH,configDir:process.env.KPLEX_TEST_CONFIG_DIR});
const output=process.env.KPLEX_HOST_REPORT_DIR;
if(!output) throw Error('Set an explicit KPLEX_HOST_REPORT_DIR outside the vault');
const outputRelative=relative(target.vault,resolve(output));
if(!outputRelative||(!isAbsolute(outputRelative)&&outputRelative!=='..'&&!outputRelative.startsWith('..'+sep)))throw Error('Reports must be outside the vault');
mkdirSync(output,{recursive:true});
const action=process.argv[2]??'observe',label=process.env.KPLEX_RESTART_LABEL??action;
const reloading=action==='run'||action==='stage-and-run';
if(!/^[a-zA-Z0-9-]{1,80}$/.test(label))throw Error('Use a simple bounded report label');
const quietMs=Number(process.env.KPLEX_RESTART_QUIET_MS??0);
if(!Number.isSafeInteger(quietMs)||quietMs<0||quietMs>3600000||quietMs>0&&quietMs<610000)throw Error('Resource acceptance needs a fixed 610000–3600000 ms quiet window');
if(existsSync(join(output,`${label}.json`)))throw Error('Report exists; choose a new KPLEX_RESTART_LABEL');
const processors=cpus();
const report={action,vault,startedAt:new Date().toISOString(),node:process.version,
  hardware:{platform:process.platform,osRelease:release(),architecture:arch(),cpuModel:processors[0]?.model??null,
    logicalProcessors:processors.length,totalMemoryBytes:totalmem()},samples:[]};
let stagedUnloaded=false,ownedStagePath=null;
/** Hash only explicit executable/configuration artifacts; never walk note files. */
function hash(path){return createHash('sha256').update(readFileSync(path)).digest('hex');}
/** Keep every CLI operation bounded; raw transport output is not copied into reports. */
function cli(command,...args){
  const r=spawnNativeSync(obsidianCliExecutable(),[`vault=${vault}`,command,...args],{cwd:root,encoding:'utf8',timeout:30000,killSignal:'SIGKILL',maxBuffer:2*1024*1024});
  if(r.error||r.status!==0||/^Error:/m.test(r.stdout??'')) throw Error('Native command failed: '+command);
  return r.stdout.trim();
}
/** Decode one aggregate response; native startup banners may precede it. */
function evaluate(code){new Script(code);const raw=cli('eval','code='+code);return JSON.parse(raw.slice(raw.indexOf('{')));}
/** Yield between observations without changing renderer scheduling or throttling. */
const delay=/** Preserve timer resolution explicitly in Node rather than the renderer. */ ms=>new Promise(/** Resolve this poll only. */ done=>setTimeout(done,ms));
/** Persist only the latest summary; the append-only stream avoids rewriting a growing trace during timing. */
function save(){writeFileSync(join(output,`${label}.json`),JSON.stringify({...report,samples:report.samples.slice(-1)},null,2)+'\n');}
const sampleCode=String.raw`(/** Read existing aggregate diagnostics without acquiring note/source data. */ ()=>{
 const p=app.plugins.plugins['k-plex'],i=p?.index,w=require('@electron/remote').getCurrentWindow(),memory=require('process').memoryUsage();
 window.kplexStartupResources?.sample(memory);
 if(${reloading}&&!window.kplexRestartHeartbeat){const b=window.kplexRestartHeartbeat={last:performance.now(),maxGapMs:0,samples:0};
  b.timer=window.setInterval(/** Observe inclusive renderer-task gaps after the first CLI observation. */ ()=>{const now=performance.now();b.maxGapMs=Math.max(b.maxGapMs,now-b.last);b.last=now;b.samples++;},50);}
 const base={at:Date.now(),timeOrigin:performance.timeOrigin,now:performance.now(),layoutReady:app.workspace.layoutReady,host:{node:process.versions.node,electron:process.versions.electron,chrome:process.versions.chrome,
  cpuPid:require('process').pid,rendererPid:w.webContents.getOSProcessId(),processType:require('process').type},
  heapUsedBytes:memory.heapUsed,nativeCpuMicroseconds:require('process').cpuUsage(),resources:window.kplexStartupResources?.snapshot()??null,heartbeat:window.kplexRestartHeartbeat?{samples:window.kplexRestartHeartbeat.samples,maxGapMs:window.kplexRestartHeartbeat.maxGapMs}:null,
  foreground:{hidden:document.hidden,documentFocused:document.hasFocus(),windowFocused:w.isFocused(),throttling:w.webContents.getBackgroundThrottling()},loaded:!!i};
 if(!i)return JSON.stringify(base);
 const status=p.getIndexStatus(),h=i.getSnapshotHydrationDiagnostics(),d=p.getStartupDiagnostics(),s=i.getSavedSnapshotSummary(),repository=i.getSourceRepositoryDiagnostics();
 return JSON.stringify({...base,status:{upToDate:status.upToDate,phase:status.phase,indexedFiles:status.indexedFiles,totalFiles:status.totalFiles},
  initializing:p.isStartupInitializing(),building:!!i.building,inventory:!!i.sourceAcquisition.inventory,pendingPersistence:i.snapshotPersistTimer!==null,semanticDependencies:i.sourceAcquisition.hasSemanticDependencies(),
  semanticActivity:{pending:i.hasPendingSemanticPreparation(),active:i.hasActiveSemanticPreparation(),failure:i.getSemanticPreparationFailure()},scheduler:i.getWorkPriorityDiagnostics(),
  visible:{surfaces:app.workspace.getLeavesOfType('k-plex-react-view').length,demands:i.semanticDemandCounts.size,
   centerKey:require('node:crypto').createHash('sha256').update(p.settings.lastActivePath??'').digest('hex'),
   expectedCenter:${JSON.stringify(process.env.KPLEX_RESTART_CENTER??null)}===null?null:p.settings.lastActivePath===${JSON.stringify(process.env.KPLEX_RESTART_CENTER??null)},
   expectedDemand:${JSON.stringify(process.env.KPLEX_RESTART_CENTER??null)}===null?null:i.semanticDemandCounts.size>0&&[...i.semanticDemandCounts.keys()].every(/** Validate actual visible demand without exporting source identities. */ path=>path===${JSON.stringify(process.env.KPLEX_RESTART_CENTER??null)})},
  mode:{indexing:p.settings.indexingMode,urls:p.settings.urlIndexingMode,throttle:p.settings.indexingThrottle,updateIntervalMs:p.settings.indexUpdateInterval},
  graph:{nodes:i.size,fingerprints:i.indexedMarkdownFileCount(),full:i.isFullSnapshotHydrated(),navigable:!!i.warmSourceRecoveryAvailable||i.isFullSnapshotHydrated(),fresh:!!i.fullSnapshotFresh,sourceSemantics:!!i.sourceBackedSemantics,sourceBacked:!!i.sourceBackedStartup,vocabulary:!!i.sourceNodeVocabularyPublished,
   declarations:i.state.evidence.declarationCount},hydration:h,startup:d,source:i.getSourceAcquisitionCounters(),url:i.getUrlIndexProgress(),
  sourceRepository:Object.fromEntries(['activated','unsaved','empty','chunksWritten','bytesWritten','readFailures','sequenceMin','sequenceMax','peakDecodeBytes'].map(/** Export fixed aggregate fields only. */ key=>[key,Number.isFinite(repository[key])?repository[key]:null])),
  saved:{active:s.active?{createdAt:s.active.createdAt,schema:s.active.schema}:null,checkpoint:!!s.checkpoint,invalid:!!s.invalidActive},
  revisions:{publication:i.publicationRevision,source:p.getIndexSourceRevision(),policy:i.semanticPolicyRevision},
  decisions:i.getIndexDiagnostics().slice(-16).map(/** Omit arbitrary fields and source identities. */ row=>({at:row.at,stage:row.stage,reason:row.reason,durationMs:row.durationMs}))});
})()`;
/** Observe only scalar/finite product diagnostics; no source/head/metadata/content inspection. */
function sample(){
  const s=evaluate(sampleCode);
  appendFileSync(join(output,`${label}.samples.jsonl`),JSON.stringify(s)+'\n');
  report.sampleCount=(report.sampleCount??0)+1;
  const origins=report.foregroundByOrigin??={},f=origins[s.timeOrigin]??={samples:0,violations:0};
  f.samples++;f.violations+=Number(s.foreground.hidden||!s.foreground.documentFocused||!s.foreground.windowFocused||!s.foreground.throttling);
  const milestones=report.firstObservedByOrigin??={},m=milestones[s.timeOrigin]??={};
  for(const [name,ready] of [['layoutReady',s.layoutReady],['savedPreview',s.hydration?.route==='saved-preview'],
    ['fullNavigable',s.graph?.navigable],['fullGraph',s.graph?.full],['semanticDependencies',s.semanticDependencies],['reportedReady',s.status?.upToDate]]){
    if(ready&&m[name]===undefined)m[name]=s.now;
  }
  // Complete evidence lives in the append-only stream; retaining it again distorts the observer's memory.
  report.samples.push(s);if(report.samples.length>2)report.samples.splice(1,1);save();return s;
}
/** Wait for honest readiness or a stable idle incomplete outcome; neither path changes flags, progress or deadlines. */
async function settled(previousOrigin){
  let stable=0,incomplete=0,firstReady;
  while(true){
    await delay(1000);
    let s;
    try{s=sample();}catch{report.transportReconnects=(report.transportReconnects??0)+1;save();await delay(10000);continue;}
    if(previousOrigin!==undefined&&s.timeOrigin===previousOrigin) continue;
    incomplete=s.loaded&&s.status.phase==='incomplete'&&!s.initializing&&!s.building&&!s.inventory&&!s.semanticActivity.active&&s.hydration.outcome!=='running'?incomplete+1:0;
    if(incomplete>=3){report.final=s;report.observedUntilNavigationMs=s.now;throw Error('Startup reports incomplete with no active source, build or semantic work');}
    stable=s.loaded&&s.status.upToDate&&!s.initializing&&!s.building&&!s.inventory&&s.hydration.outcome!=='running'?stable+1:0;
    if(stable===1)firstReady=s.at;
    if(stable>=3){if(previousOrigin!==undefined)report.firstReadyFromNavigationMs=firstReady-s.timeOrigin;return s;}
  }
}
/** Observe the prespecified maintenance window without moving later work beyond acceptance. */
async function quiescent(first){
  report.quietWindow={requiredMs:quietMs,startedAt:first.at,startingResources:first.resources,violations:0};save();
  const until=first.at+quietMs;
  let latest=first;
  while(latest.at<until){
    await delay(1000);
    try{latest=sample();}catch{report.transportReconnects=(report.transportReconnects??0)+1;save();await delay(10000);continue;}
    if(!latest.status?.upToDate||latest.initializing||latest.building||latest.inventory||latest.pendingPersistence||latest.semanticActivity.active||latest.semanticActivity.pending)report.quietWindow.violations++;
  }
  const resources=latest.resources;
  report.quietWindow.endedAt=latest.at;report.quietWindow.endingResources=resources;
  report.quietWindow.broadWorkUnchanged=Boolean(resources?.broad&&JSON.stringify(resources.broad)===JSON.stringify(first.resources?.broad));
  if(resources?.broad&&!report.quietWindow.broadWorkUnchanged)throw Error('Unexplained inventory/build/save during the fixed quiet window');
  if(report.quietWindow.violations||latest.scheduler.active.some(/** Require actual lane drain, not only a green status. */ count=>count>0)||latest.scheduler.waiting||resources?.pending||resources?.activeTransactions)throw Error('Post-ready work did not remain genuinely settled');
  return latest;
}
/** Wait for real post-ready cache/task drain before starting the fixed quiet window. */
async function drained(first){
  let latest=first,stable=0;
  while(stable<3){
    const idle=latest.status?.upToDate&&!latest.initializing&&!latest.building&&!latest.inventory&&!latest.pendingPersistence
      &&!latest.semanticActivity.active&&!latest.semanticActivity.pending&&latest.semanticDependencies
      &&latest.scheduler.active.every(/** All actual scheduler leases must have ended. */ count=>count===0)&&!latest.scheduler.waiting
      &&!(latest.resources?.pending??0)&&!(latest.resources?.activeTransactions??0);
    stable=idle?stable+1:0;
    if(stable>=3)break;
    await delay(1000);
    try{latest=sample();}catch{report.transportReconnects=(report.transportReconnects??0)+1;save();await delay(10000);}
    if(latest.status?.phase==='incomplete'&&!latest.building&&!latest.inventory&&!latest.semanticActivity.active){report.final=latest;throw Error('Incomplete after reported readiness');}
  }
  report.cacheDrainFromNavigationMs=latest.at-latest.timeOrigin;return latest;
}
/** Preserve actual renderer/focus facts for successful and failed reload trials alike. */
function recordReloadOutcome(previousOrigin){
  if(!report.final)return;
  report.rendererChanged=report.final.timeOrigin!==previousOrigin;
  report.observedUntilNavigationMs=report.final.now;
  report.allForeground=Object.entries(report.foregroundByOrigin).filter(/** The old window's pre-reload sample is outside the trial. */ ([origin])=>Number(origin)!==previousOrigin)
    .every(/** Report all observed exclusions without pretending polling proves continuous focus. */ ([,facts])=>facts.violations===0);
}
/** Start a long operation after returning from CLI transport; polling never cancels production work. */
function startTask(code){evaluate(`(/** Own completion before leaving CLI transport. */ ()=>{const c={done:false};window.kplexRestartProbe=c;window.setTimeout(/** Start only after the bounded command returns. */ ()=>{c.task=(/** Preserve the awaited production operation. */ async()=>{${code}})().then(/** Retain only the explicit aggregate result. */ value=>{c.done=true;c.value=value},/** Do not copy exceptions or note paths into the receipt. */ ()=>{c.done=true;c.failed=true})},20);return JSON.stringify({started:true})})()`);}
/** Wait for the owned controller while preserving aggregate progress and bounded transport calls. */
async function taskDone(){while(true){await delay(1000);sample();const s=evaluate("JSON.stringify({done:window.kplexRestartProbe?.done,failed:window.kplexRestartProbe?.failed,value:window.kplexRestartProbe?.value})");if(s.done){if(s.failed)throw Error('Owned native operation failed');return s.value;}}}
/** Back up configuration once per experiment; never replace an earlier original with test settings. */
function backup(){for(const [name,path] of [['data.json',join(target.pluginDir,'data.json')],['community-plugins.json',join(target.config,'community-plugins.json')]]){const destination=join(output,'original-'+name);if(!existsSync(destination))copyFileSync(path,destination);}}

/** Observe the existing native reload once; staged variants do no initialization before this boundary. */
async function restartAndObserve(before){
  if(before.host.cpuPid!==before.host.rendererPid)throw Error('CPU process is not the selected renderer');
  if(quietMs&&quietMs<2*Math.max(300000,before.mode.updateIntervalMs??0)+10000)throw Error('The prespecified quiet window does not cover two configured maintenance periods');
  const capable=evaluate("JSON.stringify({reload:!!app.commands.commands['app:reload']})");
  if(!capable.reload)throw Error('Host app:reload command unavailable');
  report.lifecycle='vault-window application reload; Electron process retained';
  report.previousTimeOrigin=before.timeOrigin;report.requestedAt=Date.now();
  evaluate("(/** Return before restarting the named vault's application renderer. */ ()=>{window.setTimeout(/** Invoke the verified native application command. */ ()=>app.commands.executeCommandById('app:reload'),100);return JSON.stringify({scheduled:true})})()");
  report.final=await settled(before.timeOrigin);report.readyFromNavigationMs=report.final.at-report.final.timeOrigin;
  if(quietMs){report.readySample=report.final;report.final=await quiescent(await drained(report.final));}
  report.cpuProcessIdentityVerified=report.final.resources
    ? report.final.resources.cpuProcess?.pid===report.final.host.rendererPid&&report.final.resources.cpuProcess?.type==='renderer':null;
  if(report.final.resources&&!report.cpuProcessIdentityVerified)throw Error('Profile CPU process is not the selected renderer');
  // Record inclusive native totals separately from the profile's shorter interval.
  report.lifecycleCpuMicroseconds=before.host.cpuPid===report.final.host.cpuPid
    ? {user:report.final.nativeCpuMicroseconds.user-before.nativeCpuMicroseconds.user,
      system:report.final.nativeCpuMicroseconds.system-before.nativeCpuMicroseconds.system}:null;
  recordReloadOutcome(before.timeOrigin);
  if(!report.allForeground)throw Error('Restart lost sampled foreground control');

}

try{
  report.driverSha256=hash(fileURLToPath(import.meta.url));
  report.workingTreeSource=Object.fromEntries(['src/main.ts','src/adapters/obsidian/sourceAcquisition.ts','src/index/SourceRepository.ts','src/index/GraphIndex.ts','src/index/IndexedDbCache.ts','src/application/supportReportProjection.ts'].map(/** Identify local source independently of installed baseline/candidate artifact identity. */ path=>[path,hash(join(root,path))]));
  const reported=cli('vault','info=path').replace(/^path\s+/,'');
  if(realpathSync(reported)!==target.vault)throw Error('CLI selected a different vault');
  evaluate("(/** Select the named disposable window without changing background throttling. */ ()=>{const r=require('@electron/remote'),w=r.getCurrentWindow();r.app.show?.();r.app.focus({steal:true});w.restore();w.show();w.moveTop();w.focus();return JSON.stringify({focused:w.isFocused()})})()");
  report.artifacts=Object.fromEntries(['main.js','manifest.json','styles.css'].map(/** Retain exact installed identity before any operation. */ name=>[name,hash(join(target.pluginDir,name))]));
  if(action==='observe'){sample();}
  else if(action==='stage'||action==='stage-and-run'){
    backup();
    const before=action==='stage-and-run'?await drained(await settled()):null;
    if(before){
      const configured=JSON.parse(readFileSync(join(target.config,'community-plugins.json'),'utf8'));
      if(!Array.isArray(configured)||!configured.includes('k-plex'))throw Error('Stage-and-run requires existing configured enablement');
    }
    const source=resolve(process.env.KPLEX_RESTART_MAIN??join(root,'dist','main.js')),destination=join(target.pluginDir,'main.js'),staged=destination+'.restart-staged';
    if(existsSync(staged))throw Error('Staging destination already exists');
    copyFileSync(source,staged);ownedStagePath=staged;if(hash(staged)!==hash(source))throw Error('Staged artifact mismatch');
    stagedUnloaded=true;
    const disabled=evaluate("(/** Finish unloading before atomically replacing executable bytes. */ async()=>{await app.plugins.disablePlugin('k-plex');return JSON.stringify({disabled:!app.plugins.plugins['k-plex']})})()");
    if(!disabled.disabled)throw Error('Selected test plugin did not unload');
    report.stagingDisableVerified=true;
    renameSync(staged,destination);ownedStagePath=null;report.installedMain=hash(destination);
    if(before){
      report.previousMain=report.artifacts['main.js'];report.artifacts['main.js']=report.installedMain;
      report.staging='Atomic replacement while unloaded; selected variant first initializes during the measured native reload';
      await restartAndObserve(before);
    }else{startTask("await app.plugins.enablePlugin('k-plex');return {enabled:!!app.plugins.plugins['k-plex']}");await taskDone();}
    stagedUnloaded=false;
  }else if(action==='prepare'){
    backup();
    evaluate("(/** Retire live preferences before the owned disposable configuration change. */ async()=>{await app.plugins.disablePlugin('k-plex');return JSON.stringify({disabled:!app.plugins.plugins['k-plex']})})()");
    const path=join(target.pluginDir,'data.json'),data=JSON.parse(readFileSync(path,'utf8'));
    data.indexingMode='eager';if(process.env.KPLEX_RESTART_CENTER)data.lastActivePath=process.env.KPLEX_RESTART_CENTER;
    writeFileSync(path,JSON.stringify(data,null,2));
    startTask("await app.plugins.enablePlugin('k-plex');return {enabled:!!app.plugins.plugins['k-plex']}");await taskDone();await settled();
    startTask("const p=app.plugins.plugins['k-plex'],i=p.index;const alreadyCompiled=i.isFullSnapshotHydrated()&&!i.sourceBackedSemantics&&i.indexedMarkdownFileCount()===app.vault.getMarkdownFiles().length;const built=alreadyCompiled?false:await i.rebuild();if(!alreadyCompiled&&!built)throw Error('Full build rejected');i.cancelPendingPersistence();const saved=await i.persistIndexedDbSnapshot(i.snapshotPersistGeneration);if(!saved)throw Error('Complete save rejected');return {built,alreadyCompiled,saved}");
    report.preparation=await taskDone();report.final=await settled();
    if(!report.final.graph.full)throw Error('Preparation did not produce a complete graph');
  }else if(action==='wait'){
    report.final=await settled();
  }else if(action==='prepare-legacy'){
    report.preparationBefore=await drained(await settled());
    report.preparationProbeSha256=hash(fileURLToPath(new URL('./startupResources.mjs',import.meta.url)));
    report.preparationMethod='Explicit test-only canonical build/save preparation; separate from primary restart timing';
    report.preparationRequestedAt=Date.now();
    startTask(`const p=app.plugins.plugins['k-plex'],i=p.index;if(i.isOnDemandMode())throw Error('Measured preparation requires the existing Eager test configuration');
      const db=await i.indexedDb.open();if(!db)throw Error('Native preparation database unavailable');
      window.kplexStartupResources?.stop();
      window.kplexStartupResources=(${createStartupResourceProbe.toString()})({phase:/** Keep the untimed setup interval distinct from restart groups. */ ()=>'creation',
        now:/** Use the owning renderer clock. */ ()=>performance.now(),cpu:/** Count actual selected-process CPU. */ ()=>require('process').cpuUsage(),
        cpuProcess:{pid:require('process').pid,type:require('process').type},databaseName:db.name,detailed:true});
      window.kplexStartupResources.attach(i);
      const built=await i.rebuild();if(!built)throw Error('Canonical preparation build rejected');
      i.cancelPendingPersistence();const saved=await i.persistIndexedDbSnapshot(i.snapshotPersistGeneration);if(!saved)throw Error('Measured preparation save rejected');
      return {built,saved}`);
    report.preparation=await taskDone();report.final=await drained(await settled());
    report.preparationElapsedMs=Date.now()-report.preparationRequestedAt;
  }else if(action==='identity'){
    report.final=await drained(await settled());
    startTask(`const i=app.plugins.plugins['k-plex'].index,publication=i.publicationRevision,policy=i.semanticPolicyRevision,source=i.plugin.getIndexSourceRevision();
      return (${startupCacheIdentity.toString()})(i.indexedDb,require('node:crypto').createHash,i.semanticFingerprints,
        /** A live publication/policy/source change cannot produce a mixed input identity. */ ()=>!i.diagnosticsClosed&&publication===i.publicationRevision&&policy===i.semanticPolicyRevision&&source===i.plugin.getIndexSourceRevision(),
        /** Actual compiler encounter order affects preferred shared-URL labels and ordered aliases. */ ()=>app.vault.getMarkdownFiles().map(file=>file.path))`);
    report.cacheIdentity=await taskDone();
  }else if(action==='memory'){
    report.before=await drained(await settled());
    startTask(`return (${startupRetainedMemory.toString()})(app,${JSON.stringify(vault)})`);
    report.retainedMemory=await taskDone();report.final=sample();
  }else if(action==='save'){
    startTask("const p=app.plugins.plugins['k-plex'],i=p.index;if(!p.getIndexStatus().upToDate||i.sourceAcquisition.inventory||!i.isFullSnapshotHydrated()||i.sourceBackedSemantics)throw Error('Current complete compiled graph required');i.cancelPendingPersistence();const saved=await i.persistIndexedDbSnapshot(i.snapshotPersistGeneration);if(!saved)throw Error('Complete save rejected');return {saved}");
    report.preparation=await taskDone();report.final=sample();
  }else if(action==='run'){
    await restartAndObserve(sample());
  }else if(action==='restore-config'){
    startTask("await app.plugins.disablePlugin('k-plex');return {disabled:!app.plugins.plugins['k-plex']}");await taskDone();
    for(const [name,path] of [['data.json',join(target.pluginDir,'data.json')],['community-plugins.json',join(target.config,'community-plugins.json')]])copyFileSync(join(output,'original-'+name),path);
    startTask("await app.plugins.enablePlugin('k-plex');return {enabled:!!app.plugins.plugins['k-plex']}");await taskDone();
    report.configurationRestored=hash(join(output,'original-data.json'))===hash(join(target.pluginDir,'data.json'))
      &&hash(join(output,'original-community-plugins.json'))===hash(join(target.config,'community-plugins.json'));
    if(!report.configurationRestored)throw Error('Original configuration bytes were not restored');
  }else throw Error('Unknown action');
  report.status='passed';
}catch(error){if(reloading)recordReloadOutcome(report.previousTimeOrigin);report.status='failed';report.error=error.message;process.exitCode=1;}
finally{
  if(stagedUnloaded){
    try{
      const restored=evaluate("(/** A failed staging observation must leave the selected test plugin loaded where possible. */ async()=>{if(!app.plugins.plugins['k-plex'])await app.plugins.enablePlugin('k-plex');return JSON.stringify({loaded:!!app.plugins.plugins['k-plex']})})()");
      if(!restored.loaded)throw Error('Selected test plugin unavailable');
    }catch{report.pluginRestoreUnavailable=true;report.status='failed';process.exitCode=1;}
  }
  if(ownedStagePath){try{unlinkSync(ownedStagePath);}catch{report.stagedCleanupUnavailable=true;report.status='failed';process.exitCode=1;}}
  try{evaluate("(/** Independently retire this driver's timer/controller and any test-only resource profile after success or failure. */ ()=>{window.clearInterval(window.kplexRestartHeartbeat?.timer);window.kplexStartupResources?.stop();delete window.kplexStartupResources;delete window.kplexRestartHeartbeat;delete window.kplexRestartProbe;return JSON.stringify({removed:!window.kplexRestartProbe&&!window.kplexRestartHeartbeat&&!window.kplexStartupResources})})()");}catch{report.cleanupUnavailable=true;}
  report.completedAt=new Date().toISOString();save();
}
console.log(JSON.stringify({status:report.status,error:report.error,file:join(output,`${label}.json`),full:report.final?.graph.full,route:report.final?.hydration.route,readyFromNavigationMs:report.readyFromNavigationMs}));
