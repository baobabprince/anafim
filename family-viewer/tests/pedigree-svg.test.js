import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGedcom } from '../src/gedcom.js';
import { DEMO_TEXT } from '../src/demo.js';
import { buildPedigreeGraph, createPedigreeSvg } from '../src/pedigree-svg.js';
import { Resvg } from '@resvg/resvg-js';

const date = new Date('2026-11-23T12:00:00Z');
const wrap = body => `0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n${body}\n0 TRLR`;
const opts = { date, lang: 'en' };

test('demo SVG contains the right generations and relatives and renders independently', () => {
  const data = parseGedcom(DEMO_TEXT);
  const three = createPedigreeSvg(data, '@I1@', opts);
  assert.match(three, /width="297mm" height="210mm"/);
  for (const name of ['תמר לוין', 'דוד לוין', 'יוסף לוין', 'אורי לוין', 'איתי כהן', 'נועה כהן']) assert.ok(three.includes(name), name);
  assert.ok(!three.includes('שלמה לוין'));
  const four = createPedigreeSvg(data, '@I1@', {...opts, generations: 4});
  assert.ok(four.includes('שלמה לוין'));
  assert.ok(new Resvg(four).render().width > 0);
});

test('selected parent family and separate partner families do not mix children', () => {
  const data = parseGedcom(wrap(`0 @C@ INDI\n1 NAME Focus\n1 FAMC @BIRTH@\n2 PEDI birth\n1 FAMC @ADOPT@\n2 PEDI adopted\n1 FAMS @F1@\n1 FAMS @F2@\n0 @P@ INDI\n1 NAME BirthParent\n0 @A@ INDI\n1 NAME AdoptParent\n0 @S@ INDI\n1 NAME AdoptSibling\n0 @T@ INDI\n1 NAME HalfSibling\n0 @X@ INDI\n1 NAME PartnerOne\n0 @Y@ INDI\n1 NAME PartnerTwo\n0 @K@ INDI\n1 NAME ChildOne\n0 @L@ INDI\n1 NAME ChildTwo\n0 @BIRTH@ FAM\n1 HUSB @P@\n1 CHIL @C@\n1 CHIL @T@\n0 @ADOPT@ FAM\n1 HUSB @A@\n1 CHIL @C@\n1 CHIL @S@\n0 @F1@ FAM\n1 HUSB @C@\n1 WIFE @X@\n1 CHIL @K@\n0 @F2@ FAM\n1 HUSB @C@\n1 WIFE @Y@\n1 CHIL @L@`));
  const svg = createPedigreeSvg(data, '@C@', {...opts, parentFamily: '@ADOPT@'});
  assert.match(svg, /AdoptParent/); assert.match(svg, /AdoptSibling/); assert.match(svg, /adopted/);
  assert.doesNotMatch(svg, /BirthParent|HalfSibling/);
  for (const name of ['PartnerOne', 'PartnerTwo', 'ChildOne', 'ChildTwo']) assert.ok(svg.includes(name));
  const model = buildPedigreeGraph(data, '@C@', {...opts, parentFamily: '@ADOPT@'});
  assert.deepEqual([...model.families.get('@F1@').partners].sort(), ['@C@', '@X@']);
  assert.deepEqual([...model.families.get('@F1@').children], ['@K@']);
  assert.deepEqual([...model.families.get('@F2@').partners].sort(), ['@C@', '@Y@']);
  assert.deepEqual([...model.families.get('@F2@').children], ['@L@']);
  assert.equal((svg.match(/class="person" data-person-id="@C@"/g) || []).length, 1);
  assert.match(svg, /data-family-id="@ADOPT@" data-person-id="@C@" data-relation="child"><polyline class="line nonbirth"/);
});

test('XML metacharacters are escaped, missing data and cycles are safe', () => {
  const data = parseGedcom(wrap('0 @A@ INDI\n1 NAME A & <script>\n1 FAMC @F@\n0 @F@ FAM\n1 HUSB @A@\n1 CHIL @A@'));
  const svg = createPedigreeSvg(data, '@A@', opts);
  assert.match(svg, /A &amp; &lt;script&gt;/);
  assert.doesNotMatch(svg, /<script>/);
  assert.ok(new Resvg(svg).render().width > 0);
  assert.throws(() => createPedigreeSvg(data, 'missing'), /Focus person not found/);
});

test('side branches include sibling families and configurable descendants, without mixing partners', () => {
  const data = parseGedcom(wrap(`0 @C@ INDI\n1 NAME Focus\n0 @S@ INDI\n1 NAME Sibling\n0 @P@ INDI\n1 NAME Parent\n0 @G@ INDI\n1 NAME Grandparent\n0 @U@ INDI\n1 NAME Aunt\n0 @Q@ INDI\n1 NAME SpouseOne\n0 @R@ INDI\n1 NAME SpouseTwo\n0 @K@ INDI\n1 NAME CousinOne\n0 @L@ INDI\n1 NAME CousinTwo\n0 @X@ INDI\n1 NAME CousinSpouse\n0 @Z@ INDI\n1 NAME CousinChild\n0 @SF@ FAM\n1 HUSB @P@\n1 CHIL @C@\n1 CHIL @S@\n0 @GF@ FAM\n1 HUSB @G@\n1 CHIL @P@\n1 CHIL @U@\n0 @UF1@ FAM\n1 WIFE @U@\n1 HUSB @Q@\n1 CHIL @K@\n0 @UF2@ FAM\n1 WIFE @U@\n1 HUSB @R@\n1 CHIL @L@\n0 @KF@ FAM\n1 HUSB @K@\n1 WIFE @X@\n1 CHIL @Z@`));
  const basic = createPedigreeSvg(data, '@C@', opts);
  assert.doesNotMatch(basic, /Aunt|CousinOne/);
  const extended = createPedigreeSvg(data, '@C@', {...opts, includeBranches: true});
  for (const name of ['Aunt', 'SpouseOne', 'SpouseTwo', 'CousinOne', 'CousinTwo']) assert.ok(extended.includes(name), name);
  const model = buildPedigreeGraph(data, '@C@', {...opts, includeBranches: true});
  assert.deepEqual([...model.families.get('@GF@').children].sort(), ['@P@', '@U@']);
  assert.deepEqual([...model.families.get('@UF1@').children], ['@K@']);
  assert.deepEqual([...model.families.get('@UF2@').children], ['@L@']);
  assert.doesNotMatch(extended, /CousinSpouse|CousinChild/);
  const deeper = createPedigreeSvg(data, '@C@', {...opts, includeBranches: true, branchGenerations: 2});
  assert.match(deeper, /CousinSpouse/); assert.match(deeper, /CousinChild/);
  const deeperModel = buildPedigreeGraph(data, '@C@', {...opts, includeBranches: true, branchGenerations: 2});
  assert.deepEqual([...deeperModel.families.get('@KF@').children], ['@Z@']);
  for (const id of deeperModel.people.keys()) assert.equal((deeper.match(new RegExp(`class="person" data-person-id="${id}"`, 'g')) || []).length, 1, id);
  assert.ok(new Resvg(deeper).render().width > 0);
});

test('five and six generations show further ancestors, with bounded traversal of cycles', () => {
  const data = parseGedcom(wrap(`0 @A@ INDI\n1 NAME Focus\n0 @B@ INDI\n1 NAME Parent\n0 @C@ INDI\n1 NAME Grandparent\n0 @D@ INDI\n1 NAME GreatGrandparent\n0 @E@ INDI\n1 NAME FifthGeneration\n0 @F@ INDI\n1 NAME SixthGeneration\n0 @F1@ FAM\n1 HUSB @B@\n1 CHIL @A@\n0 @F2@ FAM\n1 HUSB @C@\n1 CHIL @B@\n0 @F3@ FAM\n1 HUSB @D@\n1 CHIL @C@\n0 @F4@ FAM\n1 HUSB @E@\n1 CHIL @D@\n0 @F5@ FAM\n1 HUSB @F@\n1 CHIL @E@`));
  const five = createPedigreeSvg(data, '@A@', {...opts, generations: 5, includeBranches: true});
  assert.match(five, /FifthGeneration/); assert.doesNotMatch(five, /SixthGeneration/);
  const six = createPedigreeSvg(data, '@A@', {...opts, generations: 6, includeBranches: true, branchGenerations: 3});
  assert.match(six, /SixthGeneration/);
  data.families['@CYCLE@'] = { partners: ['@A@'], children: ['@F@'] };
  data.people['@F@'].parentFamilies.push({ id: '@CYCLE@', type: 'birth' });
  data.people['@A@'].spouseFamilies.push('@CYCLE@');
  const cyclic = createPedigreeSvg(data, '@A@', {...opts, generations: 6, includeBranches: true, branchGenerations: 3});
  assert.ok(cyclic.length < 200000);
});


test('pedigree collapse and multiple families share one node per person, even with identical names', () => {
  const data = parseGedcom(wrap(`0 @A@ INDI\n1 NAME Same\n0 @B@ INDI\n1 NAME Same\n0 @C@ INDI\n1 NAME Child\n0 @D@ INDI\n1 NAME ChildTwo\n0 @G@ INDI\n1 NAME SharedAncestor\n0 @F1@ FAM\n1 HUSB @A@\n1 WIFE @B@\n1 CHIL @C@\n1 CHIL @D@\n0 @F2@ FAM\n1 HUSB @G@\n1 CHIL @A@\n1 CHIL @B@`));
  const model = buildPedigreeGraph(data, '@C@', { generations: 4, includeBranches: true });
  const svg = createPedigreeSvg(data, '@C@', { ...opts, generations: 4, includeBranches: true });
  assert.equal(model.people.size, 5);
  assert.equal([...svg.matchAll(/class="person" data-person-id="([^"]+)"/g)].length, model.people.size);
  for (const id of model.people.keys()) assert.equal((svg.match(new RegExp(`class="person" data-person-id="${id}"`, 'g')) || []).length, 1, id);
  assert.equal((svg.match(/>Same<\/text>/g) || []).length, 2);
  assert.deepEqual([...model.families.get('@F2@').children].sort(), ['@A@', '@B@']);
  assert.match(svg, /data-family-id="@F2@" data-person-id="@A@" data-relation="child"/);
  assert.match(svg, /data-family-id="@F2@" data-person-id="@B@" data-relation="child"/);
  assert.ok(new Resvg(svg).render().width > 0);
});
