import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGedcom, parseGedcomAsync } from '../src/gedcom.js';
import { ageAtDeath, branchPeople, personInformation, personRecord } from '../src/person-info.js';
import { DEMO_TEXT } from '../src/demo.js';

const wrap = text => `0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n${text}\n0 TRLR`;

test('the profile gathers individual and marriage events, unique notes and source citations',()=>{
  const data=parseGedcom(DEMO_TEXT), person=data.people['@I1@'];
  const info=personInformation(data,person);
  assert.equal(info.events.find(e=>e.type==='MARR').date,'18 SEP 2009');
  assert.equal(info.events.find(e=>e.type==='MARR').partners[0].name,'איתי כהן');
  assert.equal(info.notes.length,2);
  assert.equal(info.citations.length,3);
  assert.equal(info.sourceCount,2);
  assert.equal(info.residence.place,'רמת גן, ישראל');
  assert.ok(info.places.includes('קיסריה, ישראל'));
});

test('the branch contains unique ancestors and descendants, excluding the focal person',()=>{
  const data=parseGedcom(DEMO_TEXT);
  const ancestors=branchPeople(data,'@I1@','ancestors');
  const descendants=branchPeople(data,'@I1@','descendants');
  assert.equal(ancestors.count,10);assert.equal(ancestors.depth,3);
  assert.equal(descendants.count,3);assert.equal(descendants.depth,1);
  assert.ok(ancestors.people.every(p=>p.person.id!=='@I1@'));
});

test('cyclic ancestry terminates without counting the selected person',()=>{
  const data=parseGedcom(wrap('0 @A@ INDI\n1 NAME A\n0 @B@ INDI\n1 NAME B\n0 @F1@ FAM\n1 HUSB @A@\n1 CHIL @B@\n0 @F2@ FAM\n1 HUSB @B@\n1 CHIL @A@'));
  assert.equal(branchPeople(data,'@A@','ancestors').count,1);
  assert.equal(branchPeople(data,'@A@','descendants').count,1);
});

test('a diamond pedigree counts shared ancestors once',()=>{
  const data=parseGedcom(wrap('0 @A@ INDI\n1 NAME Selected\n0 @B@ INDI\n1 NAME B\n0 @C@ INDI\n1 NAME C\n0 @D@ INDI\n1 NAME D\n0 @F1@ FAM\n1 HUSB @B@\n1 WIFE @C@\n1 CHIL @A@\n0 @F2@ FAM\n1 HUSB @D@\n1 CHIL @B@\n1 CHIL @C@'));
  assert.equal(branchPeople(data,'@A@','ancestors').count,3);
});

test('full ages at death are exact and never inferred from approximate dates or a missing death',()=>{
  assert.equal(ageAtDeath({birth:{date:'12 DEC 1855'},death:{date:'3 MAR 1953'}}),97);
  assert.equal(ageAtDeath({birth:{date:'12 DEC 1855'},death:{date:'12 DEC 1953'}}),98);
  assert.equal(ageAtDeath({birth:{date:'1855'},death:{date:'1953'}}),null);
  assert.equal(ageAtDeath({birth:{date:'ABT 1855'},death:{date:'3 MAR 1953'}}),null);
  assert.equal(ageAtDeath({birth:{date:'12 DEC 1855'}}),null);
  assert.equal(ageAtDeath({birth:{date:'31 FEB 1855'},death:{date:'3 MAR 1953'}}),null);
});

test('additional event fields, family source citations and attributes are read without inventions',async()=>{
  const raw=wrap('0 @A@ INDI\n1 NAME Ada /Example/\n1 DEAT\n2 DATE 3 MAR 1953\n2 PLAC London\n2 CAUS A recorded cause\n2 AGE 97y\n1 RELI Recorded religion\n1 NATI Recorded nationality\n1 EVEN\n2 TYPE A custom event\n2 DATE 1900\n2 ADDR First line\n3 CONT Second line\n0 @F@ FAM\n1 WIFE @A@\n1 SOUR @S@\n2 PAGE 12\n2 DATA\n3 TEXT Exact source excerpt\n0 @S@ SOUR\n1 TITL Test source');
  const data=parseGedcom(raw), person=data.people['@A@'], info=personInformation(data,person);
  assert.deepEqual(await parseGedcomAsync(raw),data);
  assert.equal(person.death.cause,'A recorded cause');assert.equal(person.death.age,'97y');
  assert.equal(person.attributes[0].value,'Recorded religion');
  assert.equal(info.events.find(e=>e.type==='EVEN').label,'A custom event');
  assert.equal(info.events.find(e=>e.type==='EVEN').address,'First line\nSecond line');
  assert.equal(info.citations[0].text,'Exact source excerpt');
});

test('original record extraction preserves tags and stops before the next record',()=>{
  const block=personRecord(DEMO_TEXT,'@I1@');
  assert.ok(block.startsWith('0 @I1@ INDI'));
  assert.ok(block.includes('1 NAME תמר /לוין/'));
  assert.ok(!block.includes('0 @I2@'));
  assert.equal(personRecord(DEMO_TEXT,'@MISSING@'),'');
});

test('source-only and custom-label-only events remain available to the inspector',()=>{
  const data=parseGedcom(wrap('0 @A@ INDI\n1 NAME A\n1 BIRT\n2 SOUR @S@\n1 EVEN\n2 TYPE A documented event\n0 @S@ SOUR\n1 TITL A source'));
  const info=personInformation(data,data.people['@A@']);
  assert.equal(info.citations.length,1);
  assert.equal(info.events.length,2);
  assert.equal(info.events[1].label,'A documented event');
});
