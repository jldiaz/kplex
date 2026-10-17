/**
 * Aggregate resource observations for the existing startup drivers and real-IDB work fixtures.
 * This test-only forwarding probe retains no owner identities or payloads, changes no scheduling,
 * and never substitutes native requests, promises, results or authority. Detailed byte accounting
 * uses JSON payload estimates, not physical disk/WAL bytes; measure its overhead separately.
 */
export function createStartupResourceProbe({ phase, now, cpu, cpuProcess, databaseName, detailed = true }) {
  const originals = [], buckets = new Map(), limit = 256;
  const started = now(), initialCpu = cpu?.();
  const cpuIdentity = cpuProcess && Number.isSafeInteger(cpuProcess.pid) && cpuProcess.pid > 0
    ? { pid: cpuProcess.pid, type: ['browser', 'renderer'].includes(cpuProcess.type) ? cpuProcess.type : 'unknown' } : null;
  let running = true, pending = 0, peakPending = 0, decodeCurrent = 0, decodePeak = 0;
  let heapMaximum = 0, rssMaximum = 0, activeTransactions = 0, peakTransactions = 0;
  const broad = { inventoryRuns: 0, fullBuildCalls: 0, nodeCatalogCalls: 0, snapshotWrites: 0, checkpointWrites: 0 };
  const hashFamilies = ['source', 'snapshot-pages', 'snapshot-evidence', 'snapshot-binding', 'source-heads', 'semantic-inputs'];
  const hashPrefixes = hashFamilies.slice(1).map(family => '[1,"' + family + '",');
  const hashing = Object.fromEntries(hashFamilies.map(family => [family, { calls: 0, utf16Units: 0 }]));
  /** Bound arbitrary host/phase labels without retaining source identities. */
  function row(label) {
    let key = phase() + ':' + label;
    if (!buckets.has(key) && buckets.size >= limit - 1) key = 'other';
    let value = buckets.get(key);
    if (!value) { value = { calls: 0, completed: 0, failed: 0, records: 0, bytes: 0, reused: 0, invalidated: 0 }; buckets.set(key, value); }
    return value;
  }
  /** Estimate serialized JSON payload size while retaining no string or payload after return. */
  function bytes(value) {
    if (!detailed || value === undefined) return 0;
    try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; } catch { return 0; }
  }
  /** Replace one method reversibly, preserving receiver and exact native return identity. */
  function wrap(owner, key, create) {
    const original = owner?.[key];
    if (typeof original !== 'function') return;
    const replacement = create(original); owner[key] = replacement;
    originals.push({ owner, key, original, replacement });
  }
  /** Count an existing operation and observe completion without replacing its returned promise. */
  function operation(owner, key, label, broadKey) {
    wrap(owner, key, /** Forward one instrumented operation. */ original => function (...args) {
      if (!running) return original.apply(this, args);
      const value = row(label); value.calls++;
      if(broadKey)broad[broadKey]++;
      if(detailed&&label==='runtime.digest'&&typeof args[0]==='string')value.bytes+=new TextEncoder().encode(args[0]).byteLength;
      let result;
      try { result = original.apply(this, args); } catch (error) { value.failed++; throw error; }
      if (result && typeof result.then === 'function') {
        pending++; peakPending = Math.max(peakPending, pending);
        result.then(/** Observe scalar proof outcomes without retaining returned facts. */ outcome => {
          value.completed++; pending--;
          if(label==='repository.matchesFamily'){
            if(outcome?.outcome==='ready'&&outcome.value===true)value.reused++;else value.invalidated++;
          }
        },
          /** Observe failure without propagating a second rejected observer promise. */ () => { value.failed++; pending--; });
      } else value.completed++;
      return result;
    });
  }
  wrap(IDBDatabase.prototype, 'transaction', /** Count actual native transactions, including direct lease cleanup. */ original => function (...args) {
    const tx = original.apply(this, args);
    if (!running || this.name !== databaseName) return tx;
    const stores = [...tx.objectStoreNames].sort().join(','), value = row('tx.' + tx.mode + '.' + stores);
    value.calls++; activeTransactions++; peakTransactions = Math.max(peakTransactions, activeTransactions);
    tx.addEventListener('complete', /** Observe one completed native transaction. */ () => { value.completed++; activeTransactions--; }, { once: true });
    tx.addEventListener('abort', /** Aborted transactions never count as completed writes. */ () => { value.failed++; activeTransactions--; }, { once: true });
    return tx;
  });
  for (const key of ['get', 'getAll', 'getAllKeys', 'openCursor', 'openKeyCursor', 'count', 'put', 'add', 'delete', 'clear']) {
    wrap(IDBObjectStore.prototype, key, /** Observe native request calls without replacing their callbacks. */ original => function (...args) {
      const request = original.apply(this, args);
      if (!running || this.transaction.db.name !== databaseName) return request;
      const write = ['put', 'add', 'delete', 'clear'].includes(key), value = row('request.' + this.transaction.mode + '.' + this.name + '.' + key);
      value.calls++;
      if (write && key !== 'clear') value.bytes += bytes(args[0]);
      if (detailed) {
        request.addEventListener('success', /** Count cursor rows separately from the single cursor request. */ () => {
          value.completed++;
          const result = request.result, data = key === 'openCursor' ? result?.value : key === 'openKeyCursor' ? result?.key : result;
          if (!write) { value.bytes += bytes(data); value.records += Array.isArray(data) ? data.length : data === undefined || data === null ? 0 : 1; }
        });
        request.addEventListener('error', /** Keep errors aggregate and omit exception payloads. */ () => { value.failed++; }, { once: true });
      }
      return request;
    });
  }
  return {
    /** Attach to the existing owners after plugin enable; early native transactions are already observed. */
    attach(index, builder) {
      const acquisition = index.sourceAcquisition, repository = acquisition.repository;
      // Counts mode must include receipt payload hashing without encoding/copying its arguments,
      // inspecting payloads or adding a promise observer per digest. Fixed protocol prefixes only.
      wrap(repository.runtime, 'digest', original => function (text) {
        if (running) {
          let family = 'source';
          if (typeof text === 'string' && text.startsWith('[1,"')) {
            for (let position = 1; position < hashFamilies.length; position++) {
              if (text.startsWith(hashPrefixes[position - 1])) { family = hashFamilies[position]; break; }
            }
          }
          hashing[family].calls++;
          if (typeof text === 'string') hashing[family].utf16Units += text.length;
        }
        return original.apply(this, arguments);
      });
      operation(acquisition, 'reconcile', 'acquisition.reconcile', 'inventoryRuns');
      operation(index, 'rebuild', 'graph.rebuild', 'fullBuildCalls');
      operation(builder?.prototype, 'buildSourceNodeCatalog', 'graph.buildSourceNodeCatalog', 'nodeCatalogCalls');
      operation(index, 'persistIndexedDbSnapshot', 'graph.persistIndexedDbSnapshot');
      operation(index.indexedDb, 'writeSnapshot', 'snapshot.writeSnapshot', 'snapshotWrites');
      operation(index.indexedDb, 'writeCheckpoint', 'snapshot.writeCheckpoint', 'checkpointWrites');
      if (detailed) {
        operation(acquisition.app.metadataCache, 'getFirstLinkpathDest', 'host.resolveReference');
        operation(acquisition.app.metadataCache, 'getFileCache', 'host.metadataLookup');
        operation(acquisition.app.vault, 'getMarkdownFiles', 'host.markdownInventory');
        for(const key of ['dailyNotesSettings','isDateProperty','resolvedLinkCount'])operation(acquisition.metadataHost,key,'host.'+key);
        for (const key of ['inspect', 'pin', 'readSelected', 'headPage', 'localDependencySelection', 'ensureLocalDependencies',
          'completeLocalDependencyInventory', 'matchesFamily', 'familyContentDigest', 'replace', 'tombstone', 'observationDigest']) operation(repository, key, 'repository.' + key);
        for (const key of ['reconcileRestartHostInventory', 'loadBody', 'acquire', 'resolve', 'currentHostInventory', 'environment']) operation(acquisition, key, 'acquisition.' + key);
        for (const key of ['digest', 'yield']) operation(repository.runtime, key, 'runtime.' + key);
        wrap(repository, 'reserveDecode', /** Preserve the exact reservation/release lifetime and bound observation memory. */ original => function (size, ...args) {
          const release = original.call(this, size, ...args);
          decodeCurrent += size; decodePeak = Math.max(decodePeak, decodeCurrent);
          return /** Forward the existing caller-owned release. */ () => { decodeCurrent -= size; return release(); };
        });
        wrap(repository, 'visitFamily', /** Count delivered validated batches without keeping decoded records. */ original => function (view, family, consume, ...args) {
          const value = row('family.' + family); value.calls++;
          return original.call(this, view, family, /** Forward the original consumer and its exact promise. */ function (records) {
            value.records += records.length;
            return consume.apply(this, arguments);
          }, ...args);
        });
      }
    },
    /** Sample existing native memory observations without forcing GC during timed startup. */
    sample(memory) {
      heapMaximum = Math.max(heapMaximum, memory.heapUsed ?? 0); rssMaximum = Math.max(rssMaximum, memory.rss ?? 0);
    },
    /** Return bounded copied aggregates; CPU is process-wide native user/system time, never await duration. */
    snapshot() {
      const currentCpu = cpu?.();
      return { elapsedMs: now() - started, detailed, running, pending, peakPending, activeTransactions, peakTransactions,
        decodeCurrent, decodePeak, heapMaximum, rssMaximum, broad: {...broad},
        cpuProcess: cpuIdentity ? { ...cpuIdentity } : null,
        hashing: Object.fromEntries(hashFamilies.map(family => [family, { ...hashing[family] }])),
        cpuMicroseconds: currentCpu && initialCpu ? { user: currentCpu.user - initialCpu.user, system: currentCpu.system - initialCpu.system } : null,
        semantics: 'Native process CPU includes host/other activity. JSON bytes estimate request payloads, not engine disk/WAL bytes. Family records count deliveries, including repeated validation. Detailed observers add unisolated overhead.',
        groups: Object.fromEntries([...buckets].map(/** Copy only bounded scalar counters. */ ([key, value]) => [key, { ...value }])) };
    },
    /** Restore only methods still owned by this probe; cleanup never cancels production work. */
    stop() {
      running = false;
      for (const entry of originals.reverse()) if (entry.owner[entry.key] === entry.replacement) entry.owner[entry.key] = entry.original;
      originals.length = 0;
    },
  };
}
