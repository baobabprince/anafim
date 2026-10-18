import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import fs from 'node:fs/promises';
import { importGedcomFile } from '../src/import-gedcom.js';
import { parseGedcom, parseGedcomAsync } from '../src/gedcom.js';

const raw = '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n0 @C@ INDI\n1 NAME יעל /בדיקה/\n1 FAMC @F@\n0 @P@ INDI\n1 NAME דנה /בדיקה/\n1 SEX F\n0 @F@ FAM\n1 WIFE @P@\n1 CHIL @C@\n0 TRLR';
const file = () => new File([raw], 'not-the-demo.ged', {type:'application/octet-stream'});

test('cooperative and synchronous parsers return identical information', async () => {
  assert.deepEqual(await parseGedcomAsync(raw), parseGedcom(raw));
});

test('a real file opens without any Worker API', async () => {
  const result = await importGedcomFile(file());
  assert.equal(result.importMethod, 'direct');
  assert.equal(result.data.people['@C@'].name, 'יעל בדיקה');
  assert.equal(result.data.stats.people, 2);
});

test('CSP/SecurityError at worker construction falls back to direct loading', async () => {
  const phases = [];
  const result = await importGedcomFile(file(), {
    workerFactory: () => { const e = new Error('Blocked by Content Security Policy'); e.name = 'SecurityError'; throw e; },
    onPhase: p => phases.push(p),
  });
  assert.equal(result.importMethod, 'direct');
  assert.equal(result.raw, raw);
  assert.ok(phases.includes('compatibility'));
});

test('asynchronous worker failure keeps the original buffer available for retry', async () => {
  let terminated = 0;
  const result = await importGedcomFile(file(), {
    workerFactory: () => ({
      postMessage(payload, transfer) {
        assert.equal(transfer, undefined, 'Do not detach the only copy of the input');
        assert.ok(payload.buffer.byteLength > 0);
        queueMicrotask(() => this.onerror?.({preventDefault(){}}));
      },
      terminate() { terminated++; },
    }),
  });
  assert.equal(result.data.stats.people, 2);
  assert.equal(result.importMethod, 'direct');
  assert.equal(terminated, 1);
});

test('postMessage failure is an environment error, not a bad GEDCOM file', async () => {
  const result = await importGedcomFile(file(), {
    workerFactory: () => ({ postMessage(){ throw new Error('DataCloneError'); }, terminate(){} }),
  });
  assert.equal(result.data.people['@C@'].name, 'יעל בדיקה');
});

test('a worker that never starts times out and loads the same file directly', async () => {
  let terminated = false;
  const result = await importGedcomFile(file(), {
    workerStartupTimeoutMs: 15,
    workerFactory: () => ({ postMessage(){}, terminate(){ terminated=true; } }),
  });
  assert.equal(result.importMethod, 'direct');
  assert.ok(terminated);
});

test('a worker that stalls after progress cannot leave the upload stuck forever', async () => {
  const result = await importGedcomFile(file(), {
    workerIdleTimeoutMs: 15,
    workerFactory: () => ({ postMessage(){ queueMicrotask(() => this.onmessage?.({data:{type:'progress',progress:5}})); }, terminate(){} }),
  });
  assert.equal(result.data.stats.people, 2);
});

test('canceling a worker import terminates it without starting a fallback', async () => {
  const controller = new AbortController();
  const phases = []; let terminated = false;
  await assert.rejects(importGedcomFile(file(), {
    signal: controller.signal,
    onPhase: p => phases.push(p),
    workerFactory: () => ({ postMessage(){ queueMicrotask(() => controller.abort()); }, terminate(){ terminated=true; } }),
  }), {name:'AbortError'});
  assert.ok(terminated);
  assert.ok(!phases.includes('compatibility'));
});

test('cooperative parsing can be canceled between tasks', async () => {
  const big = '0 HEAD\n1 GEDC\n2 VERS 7.0\n' + Array.from({length:5000},(_,i)=>`0 @I${i}@ INDI\n1 NAME Person /${i}/`).join('\n');
  const controller = new AbortController();
  const pending = parseGedcomAsync(big, {signal:controller.signal,timeBudgetMs:0,onProgress:p=>{ if(p>0) controller.abort(); }});
  await assert.rejects(pending,{name:'AbortError'});
});

test('genuine format errors have actionable error codes even when workers are blocked', async () => {
  await assert.rejects(importGedcomFile(new File(['not GEDCOM'],'bad.ged'), {
    workerFactory:()=>{throw new Error('blocked');},
  }), error => error.code === 'NO_INDIVIDUALS' && /לא נמצאו אנשים/.test(error.message));
  await assert.rejects(importGedcomFile(new File(['%PDF-1.4'],'misnamed.ged')), {code:'PDF_NOT_GEDCOM'});
  await assert.rejects(importGedcomFile(new File([Uint8Array.from([80,75,3,4])],'archive.ged')), {code:'COMPRESSED_FILE'});
  await assert.rejects(importGedcomFile(new File([],'empty.ged')), {code:'EMPTY_FILE'});
});

const fixtures = [
  ['sample555.ged',3,'utf-8'],
  ['sample55516le.ged',3,'utf-16le'],
  ['sample55516be.ged',3,'utf-16be'],
  ['TGC551.ged',15,'ansel'],
  ['TGC55CLF.ged',15,'ansel'],
  ['ftmcustomtags.ged',3,'utf-8'],
  ['legacynocustomtags.ged',4,'utf-8'],
  ['famhistnocustomtags.ged',3,'utf-8'],
];
for (const [name,count,encoding] of fixtures) test(`public third-party regression fixture: ${name}`, async () => {
  const contents = await fs.readFile(new URL('./fixtures/public/'+name, import.meta.url));
  const result = await importGedcomFile(new File([contents], name));
  assert.equal(result.data.stats.people,count);
  assert.equal(result.encoding,encoding);
  assert.equal(result.importMethod,'direct');
});
