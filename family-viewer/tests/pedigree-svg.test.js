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

test('half siblings are included through their documented shared parent and other family', () => {
  const data = parseGedcom(wrap(`0 @F@ INDI\n1 NAME Focus\n0 @S@ INDI\n1 NAME FullSibling\n0 @H1@ INDI\n1 NAME HalfSiblingOne\n0 @H2@ INDI\n1 NAME HalfSiblingTwo\n0 @P@ INDI\n1 NAME SharedParent\n0 @Q@ INDI\n1 NAME OtherParent\n0 @R@ INDI\n1 NAME NewPartner\n0 @Z@ INDI\n1 NAME ChildOfHalfSibling\n0 @PARENTS@ FAM\n1 HUSB @P@\n1 WIFE @Q@\n1 CHIL @F@\n1 CHIL @S@\n0 @OTHER@ FAM\n1 HUSB @P@\n1 WIFE @R@\n1 CHIL @H1@\n1 CHIL @H2@\n0 @H_FAM@ FAM\n1 HUSB @H1@\n1 CHIL @Z@`));
  const basic = buildPedigreeGraph(data, '@F@');
  assert.deepEqual([...basic.families.get('@PARENTS@').children].sort(), ['@F@','@S@']);
  assert.deepEqual([...basic.families.get('@OTHER@').partners].sort(), ['@P@','@R@']);
  assert.deepEqual([...basic.families.get('@OTHER@').children].sort(), ['@H1@','@H2@']);
  assert.ok(!basic.people.has('@Z@'));
  const extra = buildPedigreeGraph(data, '@F@', {includeBranches:true});
  assert.deepEqual([...extra.families.get('@H_FAM@').children], ['@Z@']);
  const svg = createPedigreeSvg(data, '@F@', {...opts, includeBranches:true});
  for (const id of extra.people.keys()) assert.equal((svg.match(new RegExp(`class="person" data-person-id="${id}"`, 'g')) || []).length, 1, id);
  assert.match(svg, /data-family-id="@OTHER@" data-person-id="@H1@" data-relation="child"/);
  assert.doesNotMatch(svg, /data-family-id="@OTHER@" data-person-id="@F@" data-relation="child"/);
  assert.ok(new Resvg(svg).render().width > 0);
});

test('one known parent and half-siblings of an ancestor do not invent unknown parent links', () => {
  const data = parseGedcom(wrap(`0 @F@ INDI\n1 NAME Focus\n0 @P@ INDI\n1 NAME Parent\n0 @G@ INDI\n1 NAME Grandparent\n0 @U@ INDI\n1 NAME HalfAunt\n0 @GF@ FAM\n1 HUSB @G@\n1 CHIL @P@\n0 @OTHER@ FAM\n1 HUSB @G@\n1 CHIL @U@\n0 @PF@ FAM\n1 HUSB @P@\n1 CHIL @F@`));
  const without = buildPedigreeGraph(data, '@F@');
  assert.ok(!without.people.has('@U@'));
  const withBranches = buildPedigreeGraph(data, '@F@', { includeBranches: true });
  assert.ok(withBranches.people.has('@U@'));
  assert.deepEqual([...withBranches.families.get('@OTHER@').partners], ['@G@']);
  assert.deepEqual([...withBranches.families.get('@OTHER@').children], ['@U@']);
});

test('terminal side descendants can be arranged in a compact ring with every name and family edge', () => {
  const people = Array.from({length:12}, (_, i) => `0 @K${i}@ INDI\n1 NAME Cousin${i} /Family/`).join('\n');
  const children = Array.from({length:12}, (_, i) => `1 CHIL @K${i}@`).join('\n');
  const data = parseGedcom(wrap(`0 @F@ INDI\n1 NAME Focus\n0 @P@ INDI\n1 NAME Parent\n0 @G@ INDI\n1 NAME Grandparent\n0 @U@ INDI\n1 NAME Aunt\n0 @Q@ INDI\n1 NAME Partner\n${people}\n0 @PF@ FAM\n1 HUSB @P@\n1 CHIL @F@\n0 @GF@ FAM\n1 HUSB @G@\n1 CHIL @P@\n1 CHIL @U@\n0 @UF@ FAM\n1 WIFE @U@\n1 HUSB @Q@\n${children}`));
  const compact = createPedigreeSvg(data, '@F@', {...opts, includeBranches:true});
  const normal = createPedigreeSvg(data, '@F@', {...opts, includeBranches:true, compactBranches:false});
  const model = buildPedigreeGraph(data, '@F@', {includeBranches:true});
  assert.match(compact, /class="branch-ring" data-family-id="@UF@"/);
  assert.doesNotMatch(normal, /class="branch-ring"/);
  for (const id of model.people.keys()) assert.equal((compact.match(new RegExp(`class="person" data-person-id="${id}"`, 'g')) || []).length, 1, id);
  for (let i=0; i<12; i++) {
    assert.match(compact, new RegExp(`class="person" data-person-id="@K${i}@" data-compact="true"`));
    assert.match(compact, new RegExp(`data-family-id="@UF@" data-person-id="@K${i}@" data-relation="child"`));
    assert.ok(compact.includes(`Cousin${i} Family`));
  }
  const width = svg => Number(svg.match(/viewBox="0 0 ([\d.]+) /)[1]);
  assert.ok(width(compact) < width(normal) * 0.7, `${width(compact)} vs ${width(normal)}`);
  assert.ok(new Resvg(compact).render().width > 0);
});

test('people with additional displayed relationships remain distinct full nodes', () => {
  const persons = Array.from({length:4}, (_, i) => `0 @K${i}@ INDI\n1 NAME Cousin${i}`).join('\n');
  const children = Array.from({length:4}, (_, i) => `1 CHIL @K${i}@`).join('\n');
  const data = parseGedcom(wrap(`0 @F@ INDI\n1 NAME Focus\n0 @P@ INDI\n1 NAME Parent\n0 @G@ INDI\n1 NAME Grandparent\n0 @U@ INDI\n1 NAME Aunt\n0 @Q@ INDI\n1 NAME CousinPartner\n0 @D@ INDI\n1 NAME CousinChild\n${persons}\n0 @PF@ FAM\n1 HUSB @P@\n1 CHIL @F@\n0 @GF@ FAM\n1 HUSB @G@\n1 CHIL @P@\n1 CHIL @U@\n0 @UF@ FAM\n1 WIFE @U@\n${children}\n0 @KF@ FAM\n1 HUSB @K0@\n1 WIFE @Q@\n1 CHIL @D@`));
  const svg = createPedigreeSvg(data, '@F@', {...opts, includeBranches:true, branchGenerations:2});
  assert.match(svg, /class="person" data-person-id="@K0@"><rect/);
  assert.match(svg, /class="person" data-person-id="@K1@" data-compact="true"/);
  assert.match(svg, /data-family-id="@KF@" data-person-id="@K0@" data-relation="partner"/);
  assert.match(svg, /data-family-id="@KF@" data-person-id="@D@" data-relation="child"/);
  assert.ok(new Resvg(svg).render().width > 0);
});

test('large side families split into rings without dropping or overlapping people', () => {
  const children = Array.from({length:29}, (_, i) => `1 CHIL @K${i}@`).join('\n');
  const people = Array.from({length:29}, (_, i) => `0 @K${i}@ INDI\n1 NAME Cousin${i}`).join('\n');
  const data = parseGedcom(wrap(`0 @F@ INDI\n1 NAME Focus\n0 @P@ INDI\n1 NAME Parent\n0 @G@ INDI\n1 NAME Grandparent\n0 @U@ INDI\n1 NAME Aunt\n${people}\n0 @PF@ FAM\n1 HUSB @P@\n1 CHIL @F@\n0 @GF@ FAM\n1 HUSB @G@\n1 CHIL @P@\n1 CHIL @U@\n0 @UF@ FAM\n1 WIFE @U@\n${children}`));
  const svg = createPedigreeSvg(data, '@F@', {...opts, includeBranches:true});
  assert.equal((svg.match(/class="branch-ring" data-family-id="@UF@"/g) || []).length, 3);
  for (let i=0; i<29; i++) {
    assert.equal((svg.match(new RegExp(`class="person" data-person-id="@K${i}@"`, 'g')) || []).length, 1);
    assert.equal((svg.match(new RegExp(`data-family-id="@UF@" data-person-id="@K${i}@" data-relation="child"`, 'g')) || []).length, 1);
  }
  const rects = [...svg.matchAll(/class="box compact-box" x="([\d.]+)" y="([\d.]+)" width="126" height="44"/g)].map(m => ({x:Number(m[1]),y:Number(m[2])}));
  assert.equal(rects.length, 29);
  for (let i=0; i<rects.length; i++) for (let j=0; j<i; j++) {
    assert.ok(Math.abs(rects[i].x-rects[j].x) >= 126 || Math.abs(rects[i].y-rects[j].y) >= 44, 'compact boxes must not overlap');
  }
  assert.ok(new Resvg(svg).render().width > 0);
});

test('adopted or multi-family children retain their own labeled edges outside a compact ring', () => {
  const data = parseGedcom(wrap(`0 @F@ INDI\n1 NAME Focus\n0 @P@ INDI\n1 NAME Parent\n0 @G@ INDI\n1 NAME Grandparent\n0 @U@ INDI\n1 NAME Aunt\n0 @K0@ INDI\n1 NAME Adopted\n1 FAMC @UF@\n2 PEDI adopted\n0 @K1@ INDI\n1 NAME One\n0 @K2@ INDI\n1 NAME Two\n0 @K3@ INDI\n1 NAME Three\n0 @PF@ FAM\n1 HUSB @P@\n1 CHIL @F@\n0 @GF@ FAM\n1 HUSB @G@\n1 CHIL @P@\n1 CHIL @U@\n0 @UF@ FAM\n1 WIFE @U@\n1 CHIL @K0@\n1 CHIL @K1@\n1 CHIL @K2@\n1 CHIL @K3@`));
  const svg = createPedigreeSvg(data, '@F@', {...opts, includeBranches:true});
  assert.match(svg, /class="person" data-person-id="@K0@"><rect/);
  assert.match(svg, /data-family-id="@UF@" data-person-id="@K0@" data-relation="child"><polyline class="line nonbirth"/);
  assert.match(svg, />adopted<\/text>/);
  assert.match(svg, /class="person" data-person-id="@K1@" data-compact="true"/);
});
