import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseGedcom } from '../src/gedcom.js';
import { getMonthlyMilestones, analyzeTreeHealth } from '../src/tree-insights.js';
import {
  listSavedFiles,
  saveStoredFile,
  deleteStoredFile,
  getActiveSavedFile,
  hasSavedFilesSync,
} from '../src/file-storage.js';

const rootDir = path.resolve(import.meta.dirname, '..');

test('getMonthlyMilestones finds births, deaths, and marriages in the current month and prioritizes today', () => {
  const ged = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME דוד /לוין/
1 SEX M
1 BIRT
2 DATE 15 NOV 1950
2 PLAC חיפה
0 @I2@ INDI
1 NAME רחל /לוין/
1 SEX F
1 BIRT
2 DATE 22 NOV 1955
2 PLAC תל אביב
1 DEAT
2 DATE 10 NOV 2020
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 25 NOV 1978
0 TRLR`;

  const data = parseGedcom(ged);
  const refDate = new Date(2026, 10, 22); // 22 Nov 2026
  const milestones = getMonthlyMilestones(data, refDate);

  assert.equal(milestones.length, 4);
  // Today's milestone (22 Nov) must come first
  assert.equal(milestones[0].isToday, true);
  assert.equal(milestones[0].personId, '@I2@');
  assert.equal(milestones[0].type, 'birth');
  assert.equal(milestones[0].yearsAgo, 71);

  // Upcoming in month (25 Nov marriage) comes before earlier days in month (10, 15 Nov)
  assert.equal(milestones[1].type, 'marriage');
  assert.equal(milestones[1].day, 25);
  assert.equal(milestones[1].yearsAgo, 48);
});

test('analyzeTreeHealth detects missing dates, missing parents, impossible dates, duplicates, and top places', () => {
  const ged = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME משה /כהן/
1 SEX M
1 BIRT
2 DATE 1950
2 PLAC ירושלים
1 DEAT
2 DATE 1940
0 @I2@ INDI
1 NAME משה /כהן/
1 SEX M
1 BIRT
2 DATE 1950
2 PLAC ירושלים
0 @I3@ INDI
1 NAME שרה /לוי/
1 SEX F
0 TRLR`;

  const data = parseGedcom(ged);
  const health = analyzeTreeHealth(data);

  assert.equal(health.totalPeople, 3);
  assert.equal(health.missingBirthDateCount, 1);
  assert.equal(health.missingParentsCount, 3);
  assert.equal(health.impossibleDates.length, 1);
  assert.equal(health.impossibleDates[0].person.id, '@I1@');
  assert.equal(health.possibleDuplicates.length, 1);
  assert.equal(health.possibleDuplicates[0].length, 2);
  assert.deepEqual(health.topPlaces[0], { place: 'ירושלים', count: 2 });
});

test('file-storage falls back cleanly to localStorage when IndexedDB is unavailable', async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };

  assert.equal(hasSavedFilesSync(), false);
  const saved = await saveStoredFile({
    filename: 'family-1500.ged',
    raw: '0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME דנה /לוי/\n0 TRLR',
    encoding: 'utf-8',
    peopleCount: 1500,
  });
  assert.ok(saved?.id);
  assert.equal(hasSavedFilesSync(), true);

  const active = await getActiveSavedFile();
  assert.equal(active?.filename, 'family-1500.ged');

  const files = await listSavedFiles();
  assert.equal(files.length, 1);

  const remaining = await deleteStoredFile(saved.id);
  assert.equal(remaining.length, 0);
});

test('offline PWA service worker exists and is registered in main.jsx', () => {
  const swPath = path.join(rootDir, 'public', 'sw.js');
  assert.ok(fs.existsSync(swPath));
  const sw = fs.readFileSync(swPath, 'utf8');
  assert.ok(sw.includes("request.mode === 'navigate'"));
  assert.ok(sw.includes('url.origin !== self.location.origin'));

  const mainJsx = fs.readFileSync(path.join(rootDir, 'src', 'main.jsx'), 'utf8');
  assert.ok(mainJsx.includes('serviceWorker.register'));
});
