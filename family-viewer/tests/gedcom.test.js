import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGedcom, getRelations, decodeGedcom, formatDate, normalize, getYear } from '../src/gedcom.js';
import { DEMO_TEXT } from '../src/demo.js';
const wrap = body => `0 HEAD\n1 GEDC\n2 VERS 7.0\n1 CHAR UTF-8\n${body}\n0 TRLR`;

test('the fictional demo contains 24 people, 9 families and five generations', () => {
  const d = parseGedcom(DEMO_TEXT);
  assert.equal(d.stats.people, 24); assert.equal(d.stats.families,9); assert.equal(d.stats.generations,5); assert.equal(d.warnings.length,0);
  const r = getRelations(d,'@I1@');
  assert.deepEqual(r.parents.map(p=>p.name),['דוד לוין','רחל לוין']);
  assert.deepEqual(r.children.map(p=>p.name),['נועה כהן','יואב כהן','מאיה כהן']);
  assert.equal(r.partners[0].name,'איתי כהן'); assert.equal(r.siblings.length,2);
});

test('family-only links are reconciled and unknown references are reported', () => {
  const d = parseGedcom(wrap('0 @A@ INDI\n1 NAME Ava /Lee/\n1 SEX F\n0 @B@ INDI\n1 NAME Ben /Lee/\n0 @F@ FAM\n1 WIFE @A@\n1 CHIL @B@\n1 CHIL @MISSING@'));
  assert.deepEqual(d.people['@B@'].parentFamilies,[{id:'@F@',type:'birth'}]);
  assert.deepEqual(getRelations(d,'@B@').parents.map(p=>p.id),['@A@']);
  assert.ok(d.warnings.some(w=>w.includes('@MISSING@')));
});

test('individual-only links are reconciled with a family record', () => {
  const d = parseGedcom(wrap('0 @A@ INDI\n1 NAME Alex /A/\n1 FAMS @F@\n0 @B@ INDI\n1 NAME B /B/\n1 FAMC @F@\n0 @F@ FAM'));
  assert.deepEqual(d.families['@F@'].partners,['@A@']);
  assert.deepEqual(d.families['@F@'].children,['@B@']);
});

test('birth and adoptive families can be selected without duplicating people', () => {
  const d = parseGedcom(wrap('0 @A@ INDI\n1 NAME Child\n1 FAMC @F1@\n2 PEDI birth\n1 FAMC @F2@\n2 PEDI adopted\n0 @B@ INDI\n1 NAME Birth parent\n0 @C@ INDI\n1 NAME Adoptive parent\n0 @F1@ FAM\n1 HUSB @B@\n1 CHIL @A@\n0 @F2@ FAM\n1 WIFE @C@\n1 CHIL @A@'));
  assert.equal(getRelations(d,'@A@').parents[0].name,'Birth parent');
  assert.equal(getRelations(d,'@A@','@F2@').parents[0].name,'Adoptive parent');
});

test('half siblings are recognized across a shared parent’s families', () => {
  const d = parseGedcom(wrap('0 @C@ INDI\n1 NAME Child\n0 @S@ INDI\n1 NAME Sibling\n0 @P@ INDI\n1 NAME Parent\n0 @Q@ INDI\n1 NAME Q\n0 @R@ INDI\n1 NAME R\n0 @F1@ FAM\n1 HUSB @P@\n1 WIFE @Q@\n1 CHIL @C@\n0 @F2@ FAM\n1 HUSB @P@\n1 WIFE @R@\n1 CHIL @S@'));
  const siblings = getRelations(d,'@C@').siblings;
  assert.equal(siblings.length,1); assert.equal(siblings[0].half,true);
});

test('multiline notes, source citations and individual birth names are retained', () => {
  const d = parseGedcom(wrap('0 @A@ INDI\n1 NAME Ada /Lovelace/\n1 NAME Ada /Byron/\n2 TYPE birth\n1 NOTE @N1@\n1 SOUR @S1@\n2 PAGE 42\n0 @N1@ NOTE First line\n1 CONT Second line\n1 CONC!\n0 @S1@ SOUR\n1 TITL Family book'));
  assert.deepEqual(d.people['@A@'].alternateNames,['Ada Byron']);
  assert.ok(d.people['@A@'].notes[0].includes('First line\nSecond line'));
  assert.equal(d.sources['@S1@'].title,'Family book'); assert.equal(d.people['@A@'].sources[0].page,'42');
});

test('malformed lines, missing links and duplicate IDs do not crash the parser', () => {
  const d = parseGedcom(wrap('bad line\n0 @A@ INDI\n1 NAME First\n1 FAMC @F404@\n0 @A@ INDI\n1 NAME Duplicate'));
  assert.equal(d.stats.people,1); assert.equal(d.people['@A@'].name,'First'); assert.ok(d.warnings.length >= 3);
});

test('ancestral cycles do not recurse forever', () => {
  const d = parseGedcom(wrap('0 @A@ INDI\n1 NAME A\n0 @B@ INDI\n1 NAME B\n0 @F1@ FAM\n1 HUSB @A@\n1 CHIL @B@\n0 @F2@ FAM\n1 HUSB @B@\n1 CHIL @A@'));
  assert.equal(d.stats.cycles,true); assert.equal(d.stats.people,2);
});

test('UTF-8, UTF-16 and Hebrew Windows-1255 can be decoded', () => {
  const raw = wrap('0 @A@ INDI\n1 NAME תמר /לוין/');
  assert.equal(decodeGedcom(new TextEncoder().encode(raw).buffer).text,raw);
  const utf16 = Buffer.concat([Buffer.from([255,254]),Buffer.from(raw,'utf16le')]);
  assert.equal(decodeGedcom(utf16.buffer.slice(utf16.byteOffset,utf16.byteOffset+utf16.byteLength)).text,raw);
  const legacy = Uint8Array.from([0xfa,0xee,0xf8]);
  assert.equal(decodeGedcom(legacy.buffer,'windows-1255').text,'תמר');
  assert.equal(decodeGedcom(Uint8Array.from([0xe2,0x65]).buffer,'ansel').text,'é');
});

test('dates and Hebrew search normalize without destroying original text', () => {
  assert.equal(formatDate('12 MAY 1985'),'12 במאי 1985');
  assert.equal(formatDate('ABT 1900'),'בערך ב־1900');
  assert.equal(formatDate('BET 1900 AND 1905'),'בין 1900 ל־1905');
  assert.equal(getYear('AFT 1897'),1897);
  assert.equal(normalize('תָּמָר /לוין/'),'תמר לוין');
});

test('invalid and PDF input returns a useful error', () => {
  assert.throws(()=>parseGedcom(''),/ריק/);
  assert.throws(()=>parseGedcom('%PDF-1.4'),/PDF/);
  assert.throws(()=>parseGedcom('not a GEDCOM'),/לא נמצאו/);
});

test('a 5,000-person file is parsed iteratively', () => {
  const raw = wrap(Array.from({length:5000},(_,i)=>`0 @I${i}@ INDI\n1 NAME Person /${i}/\n1 SEX U`).join('\n'));
  const d = parseGedcom(raw); assert.equal(d.stats.people,5000); assert.equal(d.stats.generations,1);
});

test('CONC preserves intentional spaces and GEDCOM 7 shared notes resolve', () => {
  const d = parseGedcom(wrap('0 @A@ INDI\n1 NAME Name\n1 NOTE First\n2 CONC  second\n2 CONT Next line\n1 SNOTE @N@\n0 @N@ SNOTE Shared note'));
  assert.equal(d.people['@A@'].notes[0], 'First second\nNext line');
  assert.equal(d.people['@A@'].notes[1], 'Shared note');
});

test('Western legacy accents are not mistaken for Hebrew', () => {
  const legacy = Buffer.concat([Buffer.from('0 HEAD\n1 CHAR ANSI\n0 @I1@ INDI\n1 NAME Jos'),Buffer.from([0xe9]),Buffer.from(' /Martin/\n0 TRLR')]);
  const decoded = decodeGedcom(legacy.buffer.slice(legacy.byteOffset, legacy.byteOffset+legacy.byteLength));
  assert.equal(decoded.encoding, 'windows-1252');
  assert.ok(decoded.text.includes('José'));
});
