import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGedcom } from '../src/gedcom.js';
import { DEMO_TEXT } from '../src/demo.js';
import { buildPedigreeGraph, chartPrintNameSize, connectedLineage, createPedigreeSvg, createPosterTileSvgs, resolveChartPage, wrapChartText } from '../src/pedigree-svg.js';
import fs from 'node:fs';
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


test('SVG embeds licensed fonts, remains vector, and changes physical paper size', () => {
  const data = parseGedcom(DEMO_TEXT);
  const font = path => `data:font/ttf;base64,${fs.readFileSync(new URL(path, import.meta.url)).toString('base64')}`;
  const fonts = {regular:font('../public/fonts/heebo-400.ttf'), bold:font('../public/fonts/heebo-600.ttf'), license:fs.readFileSync(new URL('../licenses/Heebo-OFL.txt', import.meta.url), 'utf8')};
  const a4 = createPedigreeSvg(data, '@I1@', {...opts, fonts});
  const a3 = createPedigreeSvg(data, '@I1@', {...opts, fonts, paper:'A3'});
  const a2 = createPedigreeSvg(data, '@I1@', {...opts, fonts, paper:'A2'});
  assert.match(a4, /width="297mm" height="210mm"/);
  assert.match(a3, /width="420mm" height="297mm"/);
  assert.match(a2, /width="594mm" height="420mm"/);
  assert.equal((a4.match(/data:font\/ttf;base64,/g) || []).length, 2);
  assert.match(a4, /SIL OPEN FONT LICENSE/);
  assert.doesNotMatch(a4, /textLength=|lengthAdjust=|<image|url\(['\"]?https?:/i);
  assert.ok(chartPrintNameSize(a3, 'A3') > chartPrintNameSize(a4, 'A4'));
  assert.ok(chartPrintNameSize(a2, 'A2') > chartPrintNameSize(a3, 'A3'));
  assert.ok(new Resvg(a4).render().width > 0);
});

test('long Hebrew and mixed-script names and places wrap without distortion or dropped words', () => {
  const name = 'רחל אנדריאה מרגריטה חנה אלישבע לאה אריאל';
  const birth = 'תל אביב יפו מחוז המרכז ישראל ארץ יפה במיוחד';
  const death = 'New York City United States of America';
  const data = parseGedcom(wrap(`0 @A@ INDI\n1 NAME ${name}\n1 BIRT\n2 PLAC ${birth}\n1 DEAT\n2 PLAC ${death}`));
  const without = createPedigreeSvg(data, '@A@', opts);
  const withPlaces = createPedigreeSvg(data, '@A@', {...opts, showPlaces:true});
  assert.doesNotMatch(without, /New York|תל אביב/);
  assert.doesNotMatch(withPlaces, /textLength=|lengthAdjust=/);
  const person = withPlaces.match(/<g class="person" data-person-id="@A@">([\s\S]*?)<\/g>/)[1];
  const texts = [...person.matchAll(/<text class="(name|place)"[^>]*>([^<]*)<\/text>/g)];
  const names = texts.filter(x => x[1] === 'name').map(x => x[2]).join(' ');
  const places = texts.filter(x => x[1] === 'place').map(x => x[2]).join(' ');
  assert.equal(names, name);
  assert.equal(places, `Birth: ${birth} Death: ${death}`);
  assert.ok(texts.filter(x => x[1] === 'name').length > 1);
  const height = svg => Number(svg.match(/<rect class="box focus"[^>]*height="([\d.]+)"/)[1]);
  assert.ok(height(withPlaces) > height(without));
  assert.ok(new Resvg(withPlaces).render().width > 0);
  const mixed = 'תָּמָר Beethoven עברית ארוכה מאד';
  assert.equal(wrapChartText(mixed, 90).join(' '), mixed);
});

test('compact rings accommodate multiline places without overlaps', () => {
  const children = Array.from({length:8}, (_,i)=>`1 CHIL @K${i}@`).join('\n');
  const people = Array.from({length:8}, (_,i)=>`0 @K${i}@ INDI\n1 NAME Child${i} /Surname/\n1 BIRT\n2 PLAC Very Long Birth Location District ${i} Example`).join('\n');
  const data = parseGedcom(wrap(`0 @F@ INDI\n1 NAME Focus\n0 @P@ INDI\n1 NAME Parent\n0 @G@ INDI\n1 NAME Grandparent\n0 @U@ INDI\n1 NAME Aunt\n${people}\n0 @PF@ FAM\n1 HUSB @P@\n1 CHIL @F@\n0 @GF@ FAM\n1 HUSB @G@\n1 CHIL @P@\n1 CHIL @U@\n0 @UF@ FAM\n1 WIFE @U@\n${children}`));
  const svg = createPedigreeSvg(data, '@F@', {...opts, includeBranches:true, showPlaces:true});
  const rects = [...svg.matchAll(/class="box compact-box" x="([\d.]+)" y="([\d.]+)" width="126" height="([\d.]+)"/g)].map(m => ({x:Number(m[1]),y:Number(m[2]),h:Number(m[3])}));
  assert.equal(rects.length, 8);
  assert.ok(rects.every(r => r.h > 44));
  for (let i=0; i<rects.length; i++) for (let j=0; j<i; j++) {
    assert.ok(Math.abs(rects[i].x-rects[j].x) >= 126 || rects[i].y+rects[i].h <= rects[j].y || rects[j].y+rects[j].h <= rects[i].y);
  }
});

test('descendant mode follows each documented union by depth, not partners or ancestors', () => {
  const data = parseGedcom(wrap(`0 @ROOT@ INDI
1 NAME Focus
0 @P@ INDI
1 NAME Parent
0 @S1@ INDI
1 NAME PartnerOne
0 @S2@ INDI
1 NAME PartnerTwo
0 @C1@ INDI
1 NAME FirstChild
1 FAMC @F1@
2 PEDI adopted
0 @C2@ INDI
1 NAME SecondChild
0 @CS@ INDI
1 NAME ChildPartner
0 @G@ INDI
1 NAME Grandchild
0 @GS@ INDI
1 NAME GrandchildPartner
0 @GG@ INDI
1 NAME GreatGrandchild
0 @X@ INDI
1 NAME PartnerOtherChild
0 @OTHER@ INDI
1 NAME OtherPartner
0 @PF@ FAM
1 HUSB @P@
1 CHIL @ROOT@
0 @F1@ FAM
1 HUSB @ROOT@
1 WIFE @S1@
1 CHIL @C1@
0 @F2@ FAM
1 HUSB @ROOT@
1 WIFE @S2@
1 CHIL @C2@
0 @CF@ FAM
1 HUSB @C1@
1 WIFE @CS@
1 CHIL @G@
0 @GF@ FAM
1 HUSB @G@
1 WIFE @GS@
1 CHIL @GG@
0 @SF@ FAM
1 HUSB @OTHER@
1 WIFE @S1@
1 CHIL @X@`));
  const two = buildPedigreeGraph(data, '@ROOT@', { mode:'descendants', generations:2 });
  assert.deepEqual([...two.people.keys()].sort(), ['@ROOT@','@S1@','@S2@','@C1@','@C2@','@CS@'].sort());
  assert.deepEqual([...two.families.get('@F1@').children], ['@C1@']);
  assert.deepEqual([...two.families.get('@F2@').children], ['@C2@']);
  assert.deepEqual([...two.families.get('@CF@').partners].sort(), ['@C1@','@CS@']);
  assert.equal(two.families.get('@CF@').children.size, 0);
  assert.ok(!two.families.has('@SF@'));
  const three = buildPedigreeGraph(data, '@ROOT@', { mode:'descendants', generations:3 });
  assert.ok(three.people.has('@G@')); assert.ok(three.people.has('@GS@'));
  assert.ok(!three.people.has('@GG@')); assert.ok(!three.people.has('@P@')); assert.ok(!three.people.has('@X@'));
  assert.deepEqual([...three.families.get('@CF@').children], ['@G@']);
  assert.deepEqual([...three.families.get('@GF@').partners].sort(), ['@G@','@GS@']);
  const svg = createPedigreeSvg(data, '@ROOT@', {...opts, mode:'descendants', generations:3, showPlaces:true, paper:'A3'});
  assert.match(svg, /generations of descendants/);
  assert.match(svg, /width="420mm" height="297mm"/);
  assert.match(svg, /data-family-id="@F1@" data-person-id="@C1@" data-relation="child"><polyline class="line nonbirth"/);
  for (const id of three.people.keys()) assert.equal((svg.match(new RegExp(`class="person" data-person-id="${id}"`, 'g')) || []).length, 1, id);
  assert.ok(new Resvg(svg).render().width > 0);
  assert.ok(buildPedigreeGraph(data, '@ROOT@', { mode:'descendants', generations:4 }).people.has('@GG@'));
});

test('descendant traversal preserves shared relationships and terminates on cycles', () => {
  const data = parseGedcom(wrap(`0 @A@ INDI
1 NAME Focus
0 @B@ INDI
1 NAME ChildOne
0 @C@ INDI
1 NAME ChildTwo
0 @D@ INDI
1 NAME SharedGrandchild
0 @E@ INDI
1 NAME GreatGrandchild
0 @F1@ FAM
1 HUSB @A@
1 CHIL @B@
1 CHIL @C@
0 @F2@ FAM
1 HUSB @B@
1 WIFE @C@
1 CHIL @D@
0 @F3@ FAM
1 HUSB @D@
1 CHIL @E@
0 @F4@ FAM
1 HUSB @E@
1 CHIL @A@`));
  const svg = createPedigreeSvg(data, '@A@', {...opts, mode:'descendants', generations:6});
  const model = buildPedigreeGraph(data, '@A@', {mode:'descendants', generations:6});
  assert.equal(model.people.size, 5);
  assert.deepEqual([...model.families.get('@F2@').partners].sort(), ['@B@','@C@']);
  assert.deepEqual([...model.families.get('@F2@').children], ['@D@']);
  assert.deepEqual([...model.families.get('@F4@').children], ['@A@']);
  for (const id of model.people.keys()) assert.equal((svg.match(new RegExp(`class="person" data-person-id="${id}"`, 'g')) || []).length, 1);
  assert.ok(new Resvg(svg).render().width > 0);
});

test('descendant cutoff retains a documented link between already visible people', () => {
  const data = parseGedcom(wrap(`0 @A@ INDI
1 NAME Root
0 @B@ INDI
1 NAME Child
0 @C@ INDI
1 NAME PartnerAndChild
0 @F1@ FAM
1 HUSB @A@
1 CHIL @B@
1 CHIL @C@
0 @F2@ FAM
1 HUSB @B@
1 CHIL @C@`));
  const model = buildPedigreeGraph(data, '@A@', {mode:'descendants', generations:2});
  assert.deepEqual([...model.families.get('@F2@').children], ['@C@']);
  const svg = createPedigreeSvg(data, '@A@', {...opts, mode:'descendants', generations:2});
  assert.match(svg, /data-family-id="@F2@" data-person-id="@C@" data-relation="child"/);
  assert.equal((svg.match(/class="person" data-person-id="@C@"/g) || []).length, 1);
});

test('descendant chart supports a single person with no known family', () => {
  const data = parseGedcom(wrap('0 @A@ INDI\n1 NAME Only Person'));
  const model = buildPedigreeGraph(data, '@A@', {mode:'descendants', generations:2});
  assert.equal(model.people.size, 1); assert.equal(model.families.size, 0);
  const svg = createPedigreeSvg(data, '@A@', {...opts, mode:'descendants', generations:2});
  assert.match(svg, /Only Person/); assert.ok(new Resvg(svg).render().width > 0);
});

test('six descendant generations include the focus and stop before the seventh', () => {
  const people = Array.from({length:7}, (_,i) => `0 @P${i}@ INDI\n1 NAME Generation${i+1}`).join('\n');
  const families = Array.from({length:6}, (_,i) => `0 @F${i}@ FAM\n1 HUSB @P${i}@\n1 CHIL @P${i+1}@`).join('\n');
  const data = parseGedcom(wrap(`${people}\n${families}`));
  const model = buildPedigreeGraph(data, '@P0@', {mode:'descendants', generations:6});
  assert.equal(model.people.size, 6);
  assert.ok(model.people.has('@P5@')); assert.ok(!model.people.has('@P6@'));
  assert.ok(!model.families.has('@F5@'));
  const svg = createPedigreeSvg(data, '@P0@', {...opts, mode:'descendants', generations:6});
  assert.match(svg, /Generation6/); assert.doesNotMatch(svg, /Generation7/);
});

test('documented sex uses distinct shapes with a readable legend and does not infer missing values', () => {
  const data = parseGedcom(wrap(`0 @M@ INDI
1 NAME Male
1 SEX m
0 @F@ INDI
1 NAME Female
1 SEX F
0 @U@ INDI
1 NAME Unspecified
0 @X@ INDI
1 NAME Other
1 SEX X
0 @FAM@ FAM
1 HUSB @M@
1 WIFE @F@
1 CHIL @U@
1 CHIL @X@`));
  for (const mode of ['ancestors','descendants']) {
    const svg = createPedigreeSvg(data, mode === 'ancestors' ? '@U@' : '@M@', {...opts, mode, generations:3});
    const box = id => svg.match(new RegExp(`<g class="person" data-person-id="${id}"[^>]*><rect ([^>]+)/>`))[1];
    assert.match(box('@M@'), /rx="2" data-sex="M"/);
    assert.match(box('@F@'), /rx="15" data-sex="F"/);
    assert.match(box('@U@'), /rx="6" data-sex="other"/);
    assert.match(box('@X@'), /rx="6" data-sex="other"/);
    assert.match(svg, /stroke-dasharray:4 2/);
    assert.match(svg, /Recorded sex: square corners/);
    assert.match(svg, /<title>Female — female<\/title>/);
    assert.match(svg, /<title>Unspecified — other or not recorded<\/title>/);
    assert.equal((svg.match(/class="person" data-person-id="@M@"/g) || []).length, 1);
    assert.ok(new Resvg(svg).render().width > 0);
  }
  // Family roles are not a substitute for an explicit SEX field.
  data.people['@M@'].sex = '';
  data.people['@F@'].sex = undefined;
  const he = createPedigreeSvg(data, '@U@', {lang:'he', date});
  assert.match(he, /מין מתועד/);
  assert.match(he, /data-person-id="@M@"><rect[^>]*data-sex="other"/);
  assert.match(he, /data-person-id="@F@"><rect[^>]*data-sex="other"/);
});

test('sex styling and unique people are retained in compact branch rings', () => {
  const data = parseGedcom(wrap(`0 @F@ INDI
1 NAME Focus
0 @P@ INDI
1 NAME Parent
0 @G@ INDI
1 NAME Grandparent
0 @U@ INDI
1 NAME Aunt
0 @K1@ INDI
1 NAME One
1 SEX M
0 @K2@ INDI
1 NAME Two
1 SEX F
0 @K3@ INDI
1 NAME Three
1 SEX U
0 @PF@ FAM
1 HUSB @P@
1 CHIL @F@
0 @GF@ FAM
1 HUSB @G@
1 CHIL @P@
1 CHIL @U@
0 @UF@ FAM
1 WIFE @U@
1 CHIL @K1@
1 CHIL @K2@
1 CHIL @K3@`));
  const svg = createPedigreeSvg(data, '@F@', {...opts, includeBranches:true, showPlaces:true});
  assert.match(svg, /dashed ring: children of one family/);
  for (const [id, sex, radius] of [['@K1@','M',2], ['@K2@','F',15], ['@K3@','other',6]]) {
    const pattern = new RegExp(`class="person" data-person-id="${id}" data-compact="true"><rect[^>]*rx="${radius}" data-sex="${sex}"`);
    assert.match(svg, pattern);
    assert.equal((svg.match(new RegExp(`class="person" data-person-id="${id}"`, 'g')) || []).length, 1);
  }
  assert.ok(new Resvg(svg).render().width > 0);
});


test('short chart footer keeps essential legends without extra attribution or device text', () => {
  const data = parseGedcom(DEMO_TEXT);
  for (const mode of ['ancestors', 'descendants']) for (const lang of ['he', 'en']) {
    const svg = createPedigreeSvg(data, '@I1@', { mode, lang, date });
    assert.doesNotMatch(svg, /נוצר במכשיר|created on this device/i);
    if (mode === 'descendants') assert.match(svg, /מעגל מקווקו: ילדי אותה משפחה|dashed ring: children of one family/);
    else assert.doesNotMatch(svg, /מעגל מקווקו: ילדי אותה משפחה|dashed ring: children of one family/);
    assert.ok(!svg.includes(new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB').format(date)));
    assert.ok(svg.includes(lang === 'he' ? 'נקודה: משפחה' : 'Dot: family'));
    assert.ok(svg.includes(lang === 'he' ? 'מין מתועד:' : 'Recorded sex:'));
    assert.ok(new Resvg(svg).render().width > 0);
  }
});

test('automatic descendant rings preserve people, families, places and sex', () => {
  const people = Array.from({length:12}, (_, i) => `0 @C${i}@ INDI\n1 NAME Child${i} /Family/\n1 SEX ${i%2 ? 'F' : 'M'}\n1 BIRT\n2 PLAC City District Country`).join('\n');
  const children = Array.from({length:12}, (_, i) => `1 CHIL @C${i}@`).join('\n');
  const data = parseGedcom(wrap(`0 @ROOT@ INDI\n1 NAME Focus\n0 @PART@ INDI\n1 NAME Partner\n${people}\n0 @FAM@ FAM\n1 HUSB @ROOT@\n1 WIFE @PART@\n${children}`));
  const options = {...opts, mode:'descendants', generations:6, paper:'A3', showPlaces:true};
  const compact = createPedigreeSvg(data, '@ROOT@', options);
  assert.match(compact, /class="branch-ring" data-family-id="@FAM@"/);
  assert.match(compact, /dashed ring: children of one family/);
  assert.match(compact, /width="420mm" height="297mm"/);
  for (let i=0; i<12; i++) {
    assert.equal((compact.match(new RegExp(`class="person" data-person-id="@C${i}@"`, 'g')) || []).length, 1);
    assert.match(compact, new RegExp(`data-person-id="@C${i}@" data-compact="true"><rect[^>]*data-sex="${i%2 ? 'F' : 'M'}"`));
    assert.ok(compact.includes(`Child${i} Family`));
  }
  const child = compact.match(/<g class="person" data-person-id="@C0@"[^>]*>([\s\S]*?)<\/g>/)[1];
  assert.equal([...child.matchAll(/<text class="place"[^>]*>([^<]*)<\/text>/g)].map(m => m[1]).join(' '), 'Birth: City District Country');
  const model = buildPedigreeGraph(data, '@ROOT@', options);
  assert.equal(model.lastDescendantDepth, 1); // Even though six generations were requested.
  assert.equal(model.descendantDepth.get('@C0@'), 1);
  assert.ok(new Resvg(compact).render().width > 0);
});

test('descendant rings form at the end of each branch and follow the depth selector', () => {
  const people = Array.from({length:4}, (_,i)=>`0 @C${i}@ INDI\n1 NAME Child${i}`).join('\n');
  const grandchildren = Array.from({length:3}, (_,i)=>`0 @G${i}@ INDI\n1 NAME Grandchild${i}`).join('\n');
  const children = Array.from({length:4}, (_,i)=>`1 CHIL @C${i}@`).join('\n');
  const kids = Array.from({length:3}, (_,i)=>`1 CHIL @G${i}@`).join('\n');
  const data = parseGedcom(wrap(`0 @R@ INDI\n1 NAME Root\n${people}\n${grandchildren}\n0 @ROOTF@ FAM\n1 HUSB @R@\n${children}\n0 @CF@ FAM\n1 HUSB @C0@\n${kids}`));
  const two = createPedigreeSvg(data, '@R@', {...opts, mode:'descendants', generations:2});
  assert.match(two, /class="branch-ring" data-family-id="@ROOTF@"/);
  assert.doesNotMatch(two, /Grandchild/);
  for (const generation of [3,6]) {
    const svg = createPedigreeSvg(data, '@R@', {...opts, mode:'descendants', generations:generation});
    assert.match(svg, /class="branch-ring" data-family-id="@ROOTF@"/);
    assert.match(svg, /class="branch-ring" data-family-id="@CF@"/);
    assert.doesNotMatch(svg, /data-person-id="@C0@" data-compact="true"/);
    for (let i=1; i<4; i++) assert.match(svg, new RegExp(`data-person-id="@C${i}@" data-compact="true"`));
    for (let i=0; i<3; i++) assert.match(svg, new RegExp(`data-person-id="@G${i}@" data-compact="true"`));
  }
});

test('descendant rings keep adopted, multiply linked and partnered people outside the circle', () => {
  const kids = Array.from({length:6}, (_,i)=>`0 @K${i}@ INDI\n1 NAME Kid${i}${i===0 ? '\n1 FAMC @F1@\n2 PEDI adopted' : ''}`).join('\n');
  const familyChildren = Array.from({length:6}, (_,i)=>`1 CHIL @K${i}@`).join('\n');
  const data = parseGedcom(wrap(`0 @R@ INDI\n1 NAME Root\n0 @P@ INDI\n1 NAME SecondPartner\n0 @Q@ INDI\n1 NAME ChildPartner\n${kids}\n0 @F1@ FAM\n1 HUSB @R@\n${familyChildren}\n0 @F2@ FAM\n1 HUSB @R@\n1 WIFE @P@\n1 CHIL @K5@\n0 @KF@ FAM\n1 HUSB @K1@\n1 WIFE @Q@`));
  const options = {...opts, mode:'descendants', generations:2};
  const svg = createPedigreeSvg(data, '@R@', {...options});
  assert.match(svg, /class="branch-ring" data-family-id="@F1@"/);
  for (const id of ['@K0@','@K1@','@K5@']) assert.doesNotMatch(svg, new RegExp(`data-person-id="${id}" data-compact="true"`));
  for (const id of ['@K2@','@K3@','@K4@']) assert.match(svg, new RegExp(`data-person-id="${id}" data-compact="true"`));
  assert.match(svg, /data-family-id="@F1@" data-person-id="@K0@" data-relation="child"><polyline class="line nonbirth"/);
  assert.match(svg, /data-family-id="@F1@" data-person-id="@K5@" data-relation="child"/);
  assert.match(svg, /data-family-id="@F2@" data-person-id="@K5@" data-relation="child"/);
  assert.match(svg, /data-family-id="@KF@" data-person-id="@K1@" data-relation="partner"/);
  const model = buildPedigreeGraph(data, '@R@', options);
  for (const id of model.people.keys()) assert.equal((svg.match(new RegExp(`class="person" data-person-id="${id}"`, 'g')) || []).length, 1, id);
  assert.ok(new Resvg(svg).render().width > 0);
});

test('large descendant families split into non-overlapping rings', () => {
  const children = Array.from({length:29}, (_, i) => `1 CHIL @K${i}@`).join('\n');
  const people = Array.from({length:29}, (_, i) => `0 @K${i}@ INDI\n1 NAME Descendant${i}\n1 BIRT\n2 PLAC Long Place Name For A Person`).join('\n');
  const data = parseGedcom(wrap(`0 @R@ INDI\n1 NAME Root\n${people}\n0 @F@ FAM\n1 HUSB @R@\n${children}`));
  const svg = createPedigreeSvg(data, '@R@', {...opts, mode:'descendants', generations:2, showPlaces:true});
  assert.equal((svg.match(/class="branch-ring" data-family-id="@F@"/g) || []).length, 3);
  const rects = [...svg.matchAll(/class="box compact-box" x="([-\d.]+)" y="([-\d.]+)" width="126" height="([\d.]+)"/g)].map(m => ({x:Number(m[1]),y:Number(m[2]),h:Number(m[3])}));
  assert.equal(rects.length, 29);
  for (let i=0; i<rects.length; i++) for (let j=0; j<i; j++) {
    assert.ok(Math.abs(rects[i].x-rects[j].x) >= 126 || rects[i].y+rects[i].h <= rects[j].y || rects[j].y+rects[j].h <= rects[i].y);
  }
  for (let i=0; i<29; i++) {
    assert.equal((svg.match(new RegExp(`class="person" data-person-id="@K${i}@"`, 'g')) || []).length, 1);
    assert.equal((svg.match(new RegExp(`data-family-id="@F@" data-person-id="@K${i}@" data-relation="child"`, 'g')) || []).length, 1);
  }
});

test('documented union endings style only the matching partner edges in both chart modes', () => {
  const data = parseGedcom(wrap(`0 @A@ INDI
1 NAME Focus
0 @B@ INDI
1 NAME Former Partner
1 DEAT Y
0 @C@ INDI
1 NAME Widowed Partner
0 @D@ INDI
1 NAME Partner With Death Only
1 DEAT Y
0 @AD@ INDI
1 NAME Adopted Child
1 FAMC @FD@
2 PEDI adopted
0 @K0@ INDI
1 NAME Child One
0 @K1@ INDI
1 NAME Child Two
0 @K2@ INDI
1 NAME Child Three
0 @FD@ FAM
1 HUSB @A@
1 WIFE @B@
1 CHIL @AD@
1 DIV Y
0 @FW@ FAM
1 HUSB @A@
1 WIFE @C@
1 CHIL @K0@
1 CHIL @K1@
1 CHIL @K2@
1 _STAT WIDOWED
0 @FU@ FAM
1 HUSB @A@
1 WIFE @D@
1 MARR
2 DATE 1 JAN 1960`));
  assert.equal(data.families['@FW@'].relationshipStatus, 'WIDOWED');
  assert.ok(data.families['@FD@'].divorce);
  for (const mode of ['ancestors','descendants']) {
    const options = {...opts, mode, generations:3};
    const svg = createPedigreeSvg(data, '@A@', options);
    for (const fid of ['@FD@', '@FW@']) for (const person of fid === '@FD@' ? ['@A@','@B@'] : ['@A@','@C@']) {
      assert.match(svg, new RegExp(`data-family-id="${fid}" data-person-id="${person}" data-relation="partner"><polyline class="line union-ended"`));
    }
    for (const id of ['@A@','@D@']) assert.match(svg, new RegExp(`data-family-id="@FU@" data-person-id="${id}" data-relation="partner"><polyline class="line"`));
    assert.match(svg, /data-family-id="@FD@" data-person-id="@AD@" data-relation="child"><polyline class="line nonbirth"/);
    assert.doesNotMatch(svg, /class="line nonbirth union-ended"/);
    assert.match(svg, />divorce<\/text>/);
    assert.match(svg, />widowhood<\/text>/);
    assert.match(svg, /Dashed partner line: recorded divorce or widowhood/);
    const model = buildPedigreeGraph(data, '@A@', options);
    for (const id of model.people.keys()) assert.equal((svg.match(new RegExp(`class="person" data-person-id="${id}"`, 'g')) || []).length, 1);
    if (mode === 'descendants') {
      assert.match(svg, /class="branch-ring" data-family-id="@FW@"/);
      for (const id of ['@K0@','@K1@','@K2@']) assert.match(svg, new RegExp(`data-family-id="@FW@" data-person-id="${id}" data-relation="child"><line class="line"`));
    }
    assert.ok(new Resvg(svg).render().width > 0);
  }
  const he = createPedigreeSvg(data, '@A@', {mode:'descendants', lang:'he'});
  assert.match(he, />גירושין<\/text>/);
  assert.match(he, />התאלמנות<\/text>/);
  assert.match(he, /קו זוגיות מקווקו/);
});

test('widowhood must be explicitly recorded on the family; deaths and personal status do not suffice', () => {
  const data = parseGedcom(wrap(`0 @A@ INDI
1 NAME First
1 EVEN
2 TYPE Widowed
0 @B@ INDI
1 NAME Deceased
1 DEAT Y
0 @F@ FAM
1 HUSB @A@
1 WIFE @B@
1 MARR
2 DATE 1900`));
  let svg = createPedigreeSvg(data, '@A@', {...opts, mode:'descendants'});
  assert.doesNotMatch(svg, /class="line union-ended"|>widowhood<\/text>|Dashed partner line/);
  data.families['@F@'].events.push({type:'EVEN', label:'Widowhood', detail:''});
  svg = createPedigreeSvg(data, '@A@', {...opts, mode:'descendants'});
  assert.match(svg, />widowhood<\/text>/);
  assert.equal((svg.match(/class="line union-ended"/g) || []).length, 2);
  data.families['@F@'].events = [{type:'EVEN', label:'Widowhood', detail:'N'}];
  svg = createPedigreeSvg(data, '@A@', {...opts, mode:'descendants'});
  assert.doesNotMatch(svg, /class="line union-ended"/);
});

test('explicit divorce and widowhood are not conflated or inferred from divorce filing', () => {
  const data = parseGedcom(wrap(`0 @A@ INDI
1 NAME Focus
0 @B@ INDI
1 NAME Partner
0 @F@ FAM
1 HUSB @A@
1 WIFE @B@
1 DIV N
1 DIVF Y`));
  let svg = createPedigreeSvg(data, '@A@', {...opts, mode:'descendants'});
  assert.doesNotMatch(svg, /class="line union-ended"|>divorce<\/text>/);
  data.families['@F@'].events = [{type:'EVEN', label:'Widowed', detail:''}];
  data.families['@F@'].divorce = {type:'DIV', detail:''};
  svg = createPedigreeSvg(data, '@A@', {...opts, mode:'descendants'});
  assert.match(svg, />divorce \/ widowhood<\/text>/);
  assert.equal((svg.match(/class="line union-ended"/g) || []).length, 2);
  assert.ok(new Resvg(svg).render().width > 0);
});

// Geometry checks use synthetic families only; no uploaded family data is saved.
function chartGeometry(svg) {
  const people = new Map();
  for (const m of svg.matchAll(/<g class="person" data-person-id="([^"]+)"[^>]*><rect[^>]* x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
    people.set(m[1], {x:Number(m[2]), y:Number(m[3]), width:Number(m[4]), height:Number(m[5])});
  }
  const rings = new Map();
  for (const m of svg.matchAll(/<g class="branch-ring" data-family-id="([^"]+)"><ellipse[^>]* cx="([-\d.]+)" cy="([-\d.]+)" rx="([\d.]+)" ry="([\d.]+)"/g)) {
    rings.set(m[1], {x:Number(m[2]), y:Number(m[3]), rx:Number(m[4]), ry:Number(m[5])});
  }
  const lines = [];
  for (const m of svg.matchAll(/<g data-family-id="([^"]+)"(?: data-person-id="([^"]+)")? data-relation="(partner|child|cluster)"><(polyline|line)\b([^>]*)/g)) {
    const [family, person, type, tag, attrs] = m.slice(1);
    let points;
    if (tag === 'polyline') points = attrs.match(/points="([^"]+)"/)[1].split(' ').map(p => p.split(',').map(Number));
    else {
      const attr = name => Number(attrs.match(new RegExp(`${name}="([-\\d.]+)"`))[1]);
      points = [[attr('x1'),attr('y1')],[attr('x2'),attr('y2')]];
    }
    for (let i=1; i<points.length; i++) if (Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]) > 0.01) lines.push({family,person,type,a:points[i-1],b:points[i]});
  }
  return {people, rings, lines};
}

function strictIntersection(a,b,c,d) {
  const cross = (p,q,r) => (q[0]-p[0])*(r[1]-p[1]) - (q[1]-p[1])*(r[0]-p[0]);
  return cross(a,b,c)*cross(a,b,d) < -1e-6 && cross(c,d,a)*cross(c,d,b) < -1e-6;
}

function segmentsTouch(a,b,c,d) {
  const cross = (p,q,r) => (q[0]-p[0])*(r[1]-p[1]) - (q[1]-p[1])*(r[0]-p[0]);
  const onSegment = (p,q,r) => Math.abs(cross(p,q,r)) < 1e-6 &&
    r[0] >= Math.min(p[0],q[0])-1e-6 && r[0] <= Math.max(p[0],q[0])+1e-6 &&
    r[1] >= Math.min(p[1],q[1])-1e-6 && r[1] <= Math.max(p[1],q[1])+1e-6;
  return strictIntersection(a,b,c,d) || onSegment(a,b,c) || onSegment(a,b,d) || onSegment(c,d,a) || onSegment(c,d,b);
}

test('descendant family blocks keep circles with their married siblings without crossing unrelated lines', () => {
  const people = ['R','S','A','AP','B','BP','A1','A1P','A1P2','A2','A2P','A3','A4','A5','B1','B1P','B2','B3','B4']
    .map(id => `0 @${id}@ INDI\n1 NAME Person${id}`).join('\n');
  const data = parseGedcom(wrap(`${people}
0 @FR@ FAM
1 HUSB @R@
1 WIFE @S@
1 CHIL @A@
1 CHIL @B@
0 @FA@ FAM
1 HUSB @A@
1 WIFE @AP@
1 CHIL @A1@
1 CHIL @A2@
1 CHIL @A3@
1 CHIL @A4@
1 CHIL @A5@
0 @FB@ FAM
1 HUSB @B@
1 WIFE @BP@
1 CHIL @B1@
1 CHIL @B2@
1 CHIL @B3@
1 CHIL @B4@
0 @A1F@ FAM
1 HUSB @A1@
1 WIFE @A1P@
0 @A1F2@ FAM
1 HUSB @A1@
1 WIFE @A1P2@
0 @A2F@ FAM
1 HUSB @A2@
1 WIFE @A2P@
0 @B1F@ FAM
1 HUSB @B1@
1 WIFE @B1P@`));
  const options = {...opts, mode:'descendants', generations:3};
  const svg = createPedigreeSvg(data, '@R@', options);
  assert.match(svg, /data-layout="family-tree"/);
  const {people: positions, rings, lines} = chartGeometry(svg);
  assert.equal(rings.size, 2);
  assert.ok(rings.has('@FA@') && rings.has('@FB@'));
  for (const [fid, siblings, otherSiblings] of [
    ['@FA@',['@A1@','@A2@'],['@B1@']], ['@FB@',['@B1@'],['@A1@','@A2@']],
  ]) {
    const ring = rings.get(fid);
    const center = id => {const p=positions.get(id); return p.x+p.width/2;};
    const near = Math.min(...siblings.map(id => Math.abs(ring.x-center(id))));
    const far = Math.min(...otherSiblings.map(id => Math.abs(ring.x-center(id))));
    assert.ok(near < far, `${fid}: circle must be closer to its own siblings`);
  }
  for (let i=0; i<lines.length; i++) for (let j=0; j<i; j++) {
    const a = lines[i], b = lines[j];
    const sharedPartner = a.type === 'partner' && b.type === 'partner' && a.person === b.person;
    if (a.family !== b.family && !sharedPartner) assert.ok(!segmentsTouch(a.a,a.b,b.a,b.b), 'unrelated family lines must not cross, overlap or touch');
  }
  for (const line of lines) for (const [id, box] of positions) {
    if (id === line.person) continue;
    const x1=box.x,y1=box.y,x2=x1+box.width,y2=y1+box.height;
    const corners = [[x1,y1],[x2,y1],[x2,y2],[x1,y2]];
    assert.ok(!corners.some((point,index) => strictIntersection(line.a,line.b,point,corners[(index+1)%4])), 'a line must not pass through another person');
  }
  const boxes = [...positions.values()];
  for (let i=0; i<boxes.length; i++) for (let j=0; j<i; j++) {
    const a=boxes[i],b=boxes[j];
    assert.ok(a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y, 'people must not overlap');
  }
  const model = buildPedigreeGraph(data, '@R@', options);
  for (const id of model.people.keys()) assert.equal((svg.match(new RegExp(`class="person" data-person-id="${id}"`, 'g')) || []).length, 1, id);
  assert.ok(new Resvg(svg).render().width > 0);
});

test('cross-linked descendants fall back without dropping relationships or duplicating people', () => {
  const data = parseGedcom(wrap(`0 @R@ INDI\n1 NAME Root\n0 @A@ INDI\n1 NAME ChildA\n0 @B@ INDI\n1 NAME ChildB\n0 @C@ INDI\n1 NAME SharedChild\n0 @F0@ FAM\n1 HUSB @R@\n1 CHIL @A@\n1 CHIL @B@\n0 @F1@ FAM\n1 HUSB @A@\n1 CHIL @C@\n0 @F2@ FAM\n1 HUSB @B@\n1 CHIL @C@`));
  const svg = createPedigreeSvg(data, '@R@', {...opts, mode:'descendants', generations:3});
  assert.match(svg, /data-layout="graph"/);
  assert.equal((svg.match(/class="person" data-person-id="@C@"/g)||[]).length, 1);
  assert.match(svg, /data-family-id="@F1@" data-person-id="@C@" data-relation="child"/);
  assert.match(svg, /data-family-id="@F2@" data-person-id="@C@" data-relation="child"/);
  assert.ok(new Resvg(svg).render().width > 0);
});

test('automatic sibling circles coexist at different depths beside multiple continuing branches', () => {
  const names = ['R','A','AP','B','C','D','G1','G2','G3','G4','G5','P1','P2',
    'H1','H2','H3','J1','J2','J3'];
  const individuals = names.map(id => `0 @${id}@ INDI\n1 NAME Person${id}`).join('\n');
  const data = parseGedcom(wrap(`${individuals}
0 @ROOTF@ FAM
1 HUSB @R@
1 CHIL @A@
1 CHIL @B@
1 CHIL @C@
1 CHIL @D@
0 @AF@ FAM
1 HUSB @A@
1 WIFE @AP@
1 CHIL @G1@
1 CHIL @G2@
1 CHIL @G3@
1 CHIL @G4@
1 CHIL @G5@
0 @G1F@ FAM
1 HUSB @G1@
1 WIFE @P1@
1 CHIL @H1@
1 CHIL @H2@
1 CHIL @H3@
0 @G2F@ FAM
1 HUSB @G2@
1 WIFE @P2@
1 CHIL @J1@
1 CHIL @J2@
1 CHIL @J3@`));
  const options = {...opts, mode:'descendants', generations:4};
  const svg = createPedigreeSvg(data, '@R@', options);
  assert.match(svg, /data-layout="family-tree"/);
  for (const fid of ['ROOTF','AF','G1F','G2F']) assert.match(svg, new RegExp(`class="branch-ring" data-family-id="@${fid}@"`));
  for (const id of ['B','C','D','G3','G4','G5','H1','H2','H3','J1','J2','J3']) assert.match(svg, new RegExp(`data-person-id="@${id}@" data-compact="true"`));
  for (const id of ['A','G1','G2']) assert.doesNotMatch(svg, new RegExp(`data-person-id="@${id}@" data-compact="true"`));
  const model = buildPedigreeGraph(data, '@R@', options);
  for (const id of model.people.keys()) assert.equal((svg.match(new RegExp(`class="person" data-person-id="${id}"`, 'g')) || []).length, 1, id);
  for (const [fid, family] of model.families) {
    for (const id of family.children) assert.equal((svg.match(new RegExp(`data-family-id="${fid}" data-person-id="${id}" data-relation="child"`, 'g')) || []).length, 1);
    for (const id of family.partners) assert.equal((svg.match(new RegExp(`data-family-id="${fid}" data-person-id="${id}" data-relation="partner"`, 'g')) || []).length, 1);
  }
  const {people, rings, lines} = chartGeometry(svg);
  assert.equal(rings.size, 4);
  const boxes = [...people.values()];
  for (let i=0; i<boxes.length; i++) for (let j=0; j<i; j++) {
    const a=boxes[i],b=boxes[j];
    assert.ok(a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y, 'people must not overlap');
  }
  for (let i=0; i<lines.length; i++) for (let j=0; j<i; j++) {
    const a=lines[i], b=lines[j];
    const sharedPartner = a.type === 'partner' && b.type === 'partner' && a.person === b.person;
    if (a.family !== b.family && !sharedPartner) assert.ok(!segmentsTouch(a.a,a.b,b.a,b.b), 'unrelated family lines must not cross, overlap or touch');
  }
  for (const line of lines) for (const [id, box] of people) {
    if (id === line.person) continue;
    const x1=box.x,y1=box.y,x2=x1+box.width,y2=y1+box.height;
    const corners = [[x1,y1],[x2,y1],[x2,y2],[x1,y2]];
    assert.ok(!corners.some((point,index) => strictIntersection(line.a,line.b,point,corners[(index+1)%4])), 'a line must not pass through another person');
  }
  assert.ok(new Resvg(svg).render().width > 0);
  for (const [generations, expected] of [[2,['ROOTF']], [3,['ROOTF','AF']]]) {
    const short = createPedigreeSvg(data, '@R@', {...options, generations});
    const actual = [...short.matchAll(/class="branch-ring" data-family-id="@([^@]+)@"/g)].map(m=>m[1]);
    assert.deepEqual(actual.sort(), expected.sort());
  }
});

test('automatic circles survive general graph fallback at different depths', () => {
  const ids = ['R','A','B','C','D','E','X','Y','Z','Q'];
  const people = ids.map(id => `0 @${id}@ INDI\n1 NAME Person${id}`).join('\n');
  const data = parseGedcom(wrap(`${people}
0 @F0@ FAM
1 HUSB @R@
1 CHIL @A@
1 CHIL @B@
1 CHIL @C@
1 CHIL @D@
0 @F1@ FAM
1 HUSB @A@
1 CHIL @E@
1 CHIL @X@
1 CHIL @Y@
1 CHIL @Z@
0 @F2@ FAM
1 HUSB @R@
1 WIFE @Q@
1 CHIL @E@`));
  const svg = createPedigreeSvg(data, '@R@', {...opts, mode:'descendants', generations:3});
  assert.match(svg, /data-layout="graph"/);
  for (const fid of ['F0','F1']) assert.match(svg, new RegExp(`class="branch-ring" data-family-id="@${fid}@"`));
  assert.equal((svg.match(/class="person" data-person-id="@E@"/g) || []).length, 1);
  for (const fid of ['F1','F2']) assert.match(svg, new RegExp(`data-family-id="@${fid}@" data-person-id="@E@" data-relation="child"`));
  for (const id of ['B','C','D','X','Y','Z']) assert.match(svg, new RegExp(`data-person-id="@${id}@" data-compact="true"`));
  assert.ok(new Resvg(svg).render().width > 0);
});

test('descendant layout staggers descendants spouses half a row below and inward while keeping root side-by-side', () => {
  const data = parseGedcom(DEMO_TEXT);
  for (const lang of ['he', 'en']) {
    const svg = createPedigreeSvg(data, '@I2@', { mode: 'descendants', generations: 3, lang, date });
    assert.match(svg, /data-layout="family-tree"/);
    const { people, lines } = chartGeometry(svg);
    const root = people.get('@I2@'), rootSpouse = people.get('@I3@');
    assert.equal(root.y, rootSpouse.y);
    assert.equal(root.width, 150);
    assert.equal(rootSpouse.width, 150);
    assert.doesNotMatch(svg, /data-person-id="@I3@"[^>]*data-spouse="true"/);

    for (const [ownerId, spouseId] of [['@I4@', '@I14@'], ['@I1@', '@I6@'], ['@I5@', '@I15@']]) {
      assert.match(svg, new RegExp(`data-person-id="${spouseId}"[^>]*data-spouse="true"`));
      assert.doesNotMatch(svg, new RegExp(`data-person-id="${ownerId}"[^>]*data-spouse="true"`));
      const owner = people.get(ownerId), spouse = people.get(spouseId);
      assert.equal(spouse.width, 136);
      assert.ok(spouse.y >= owner.y + owner.height, `${spouseId} must sit below ${ownerId}`);
      if (lang === 'he') assert.ok(spouse.x + spouse.width < owner.x + owner.width, 'RTL spouse must indent left of owner right edge');
      else assert.ok(spouse.x > owner.x, 'LTR spouse must indent right of owner left edge');
    }
    const boxes = [...people.values()];
    for (let i = 0; i < boxes.length; i++) for (let j = 0; j < i; j++) {
      const a = boxes[i], b = boxes[j];
      assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
    }
    for (let i = 0; i < lines.length; i++) for (let j = 0; j < i; j++) {
      const a = lines[i], b = lines[j];
      const sharedPartner = a.type === 'partner' && b.type === 'partner' && a.person === b.person;
      if (a.family !== b.family && !sharedPartner) assert.ok(!segmentsTouch(a.a, a.b, b.a, b.b));
    }
    for (const line of lines) for (const [id, box] of people) {
      if (id === line.person) continue;
      const x1 = box.x, y1 = box.y, x2 = x1 + box.width, y2 = y1 + box.height;
      const corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
      assert.ok(!corners.some((pt, idx) => strictIntersection(line.a, line.b, pt, corners[(idx + 1) % 4])));
    }
    assert.ok(new Resvg(svg).render().width > 0);
  }

  // Row of 4 married leaf descendants saves substantial horizontal width compared to side-by-side couples.
  const leafPeople = Array.from({ length: 4 }, (_, i) => `0 @C${i}@ INDI\n1 NAME Child${i}\n0 @S${i}@ INDI\n1 NAME Spouse${i}`).join('\n');
  const leafFams = Array.from({ length: 4 }, (_, i) => `0 @F${i}@ FAM\n1 HUSB @C${i}@\n1 WIFE @S${i}@`).join('\n');
  const leafChil = Array.from({ length: 4 }, (_, i) => `1 CHIL @C${i}@`).join('\n');
  const wide = parseGedcom(wrap(`0 @R@ INDI\n1 NAME Root\n0 @RS@ INDI\n1 NAME RootSpouse\n${leafPeople}\n0 @FR@ FAM\n1 HUSB @R@\n1 WIFE @RS@\n${leafChil}\n${leafFams}`));
  const wideSvg = createPedigreeSvg(wide, '@R@', { mode: 'descendants', generations: 2, lang: 'he', date });
  const viewWidth = Number(wideSvg.match(/viewBox="0 0 ([\d.]+) /)[1]);
  assert.ok(viewWidth < 900, `Expected compact width < 900, got ${viewWidth}`);
  assert.ok(new Resvg(wideSvg).render().width > 0);
});

test('staggered descendant couples handle multiline places, two marriages, union endings, and sibling rings cleanly', () => {
  const data = parseGedcom(wrap(`
0 @R@ INDI
1 NAME אברהם /ברזילי/
1 SEX M
0 @RS@ INDI
1 NAME שרה /ברזילי/
1 SEX F
0 @C1@ INDI
1 NAME יוסי /ברזילי/
1 SEX M
1 BIRT
2 PLAC תל אביב יפו מחוז המרכז ישראל
0 @C1S@ INDI
1 NAME מיכל /שפירא לוי כהן/
1 SEX F
1 BIRT
2 PLAC ירושלים מחוז ירושלים ישראל
0 @G1@ INDI
1 NAME עומר /ברזילי/
1 SEX M
0 @G1S@ INDI
1 NAME דנה /לוי/
1 SEX F
0 @C2@ INDI
1 NAME אילן /ברזילי/
1 SEX M
0 @C2S1@ INDI
1 NAME רונית /גולן/
1 SEX F
0 @C2S2@ INDI
1 NAME טלי /עוז/
1 SEX F
0 @G2@ INDI
1 NAME ליאור /ברזילי/
1 SEX M
0 @G4@ INDI
1 NAME מאיה /ברזילי/
1 SEX F
0 @G5@ INDI
1 NAME שי /ברזילי/
1 SEX M
0 @G6@ INDI
1 NAME גיל /ברזילי/
1 SEX M
0 @FR@ FAM
1 HUSB @R@
1 WIFE @RS@
1 CHIL @C1@
1 CHIL @C2@
0 @F1@ FAM
1 HUSB @C1@
1 WIFE @C1S@
1 CHIL @G1@
1 DIV Y
0 @FG1@ FAM
1 HUSB @G1@
1 WIFE @G1S@
0 @F2A@ FAM
1 HUSB @C2@
1 WIFE @C2S1@
1 CHIL @G2@
1 DIV Y
0 @F2B@ FAM
1 HUSB @C2@
1 WIFE @C2S2@
1 CHIL @G4@
1 CHIL @G5@
1 CHIL @G6@
1 _STAT WIDOWED`));
  for (const lang of ['he', 'en']) {
    const svg = createPedigreeSvg(data, '@R@', { mode: 'descendants', generations: 3, showPlaces: true, lang, date });
    assert.match(svg, /data-layout="family-tree"/);
    assert.match(svg, /class="branch-ring" data-family-id="@F2B@"/);
    assert.match(svg, lang === 'he' ? />גירושין<\/text>/ : />divorce<\/text>/);
    assert.match(svg, lang === 'he' ? />התאלמנות<\/text>/ : />widowhood<\/text>/);
    const { people, lines } = chartGeometry(svg);
    const boxes = [...people.values()];
    for (let i = 0; i < boxes.length; i++) for (let j = 0; j < i; j++) {
      const a = boxes[i], b = boxes[j];
      assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, `${lang}: boxes must not overlap`);
    }
    for (let i = 0; i < lines.length; i++) for (let j = 0; j < i; j++) {
      const a = lines[i], b = lines[j];
      const sharedPartner = a.type === 'partner' && b.type === 'partner' && a.person === b.person;
      if (a.family !== b.family && !sharedPartner) assert.ok(!segmentsTouch(a.a, a.b, b.a, b.b), `${lang}: unrelated family lines must not touch`);
    }
    for (const line of lines) for (const [id, box] of people) {
      if (id === line.person) continue;
      const x1 = box.x, y1 = box.y, x2 = x1 + box.width, y2 = y1 + box.height;
      const corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
      assert.ok(!corners.some((pt, idx) => strictIntersection(line.a, line.b, pt, corners[(idx + 1) % 4])), `${lang}: line passes through ${id}`);
    }
    assert.ok(new Resvg(svg).render().width > 0);
  }
});

test('cross-linked descendant graph fallback preserves normal non-staggered boxes', () => {
  const data = parseGedcom(wrap(`0 @R@ INDI\n1 NAME Root\n0 @A@ INDI\n1 NAME ChildA\n0 @B@ INDI\n1 NAME ChildB\n0 @BS@ INDI\n1 NAME ChildBSpouse\n0 @C@ INDI\n1 NAME SharedGrandchild\n0 @F0@ FAM\n1 HUSB @R@\n1 CHIL @A@\n1 CHIL @B@\n0 @F1@ FAM\n1 HUSB @A@\n1 CHIL @C@\n0 @F2@ FAM\n1 HUSB @B@\n1 WIFE @BS@\n1 CHIL @C@`));
  const svg = createPedigreeSvg(data, '@R@', { ...opts, mode: 'descendants', generations: 3 });
  assert.match(svg, /data-layout="graph"/);
  assert.doesNotMatch(svg, /data-spouse="true"/);
  assert.equal(chartGeometry(svg).people.get('@BS@').width, 150);
});

test('RTL ordering puts root and older siblings on the right and isolates Hebrew subtitle digits', () => {
  const data = parseGedcom(DEMO_TEXT);
  const he = createPedigreeSvg(data, '@I2@', { mode: 'descendants', generations: 3, lang: 'he', date });
  const en = createPedigreeSvg(data, '@I2@', { mode: 'descendants', generations: 3, lang: 'en', date });
  const hePeople = chartGeometry(he).people;
  const enPeople = chartGeometry(en).people;
  assert.ok(hePeople.get('@I2@').x > hePeople.get('@I3@').x, 'RTL root sits right of partner');
  assert.ok(enPeople.get('@I2@').x < enPeople.get('@I3@').x, 'LTR root sits left of partner');
  assert.ok(hePeople.get('@I4@').x > hePeople.get('@I5@').x, 'RTL older sibling sits right of younger');
  assert.ok(enPeople.get('@I4@').x < enPeople.get('@I5@').x, 'LTR older sibling sits left of younger');
  assert.match(he, /\u200f3 דורות של צאצאים/);
  assert.match(he, /unicode-bidi:embed/);
});

test('compact sibling grid layout narrows 1-column and 2-column branches without overlaps or crossings', () => {
  for (const count of [4, 7]) {
    const branches = ['A', 'B', 'C'];
    const people = [];
    const fams = [];
    for (const b of branches) {
      people.push(`0 @${b}@ INDI\n1 NAME Branch${b}`);
      const childTags = [];
      for (let i = 0; i < count; i++) {
        const cid = `@${b}${i}@`;
        people.push(`0 ${cid} INDI\n1 NAME Child${b}${i}\n1 SEX ${i % 2 ? 'F' : 'M'}`);
        childTags.push(`1 CHIL ${cid}`);
      }
      fams.push(`0 @F${b}@ FAM\n1 HUSB @${b}@\n${childTags.join('\n')}`);
    }
    const data = parseGedcom(wrap(`0 @R@ INDI\n1 NAME Root\n${people.join('\n')}\n0 @FR@ FAM\n1 HUSB @R@\n${branches.map(b => `1 CHIL @${b}@`).join('\n')}\n${fams.join('\n')}`));
    const ringSvg = createPedigreeSvg(data, '@R@', { mode: 'descendants', generations: 3, lang: 'he', siblingLayout: 'ring', date });
    const gridSvg = createPedigreeSvg(data, '@R@', { mode: 'descendants', generations: 3, lang: 'he', siblingLayout: 'grid', date });
    const width = svg => Number(svg.match(/viewBox="0 0 ([\d.]+) /)[1]);
    assert.match(gridSvg, /class="branch-ring branch-grid" data-family-id="@FA@"/);
    assert.ok(width(gridSvg) < width(ringSvg) * 0.85, `grid width ${width(gridSvg)} must be substantially narrower than ring ${width(ringSvg)} for ${count} kids`);
    const { people: boxesMap, lines } = chartGeometry(gridSvg);
    const boxes = [...boxesMap.values()];
    for (let i = 0; i < boxes.length; i++) for (let j = 0; j < i; j++) {
      const a = boxes[i], b = boxes[j];
      assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
    }
    for (let i = 0; i < count; i++) {
      assert.match(gridSvg, new RegExp(`data-family-id="@FA@" data-person-id="@A${i}@" data-relation="child"`));
    }
    for (const line of lines) for (const [id, box] of boxesMap) {
      if (id === line.person) continue;
      const x1 = box.x, y1 = box.y, x2 = x1 + box.width, y2 = y1 + box.height;
      const corners = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
      assert.ok(!corners.some((pt, idx) => strictIntersection(line.a, line.b, pt, corners[(idx + 1) % 4])));
    }
    assert.ok(new Resvg(gridSvg).render().width > 0);
  }
});

test('dedicated ancestor layout arranges vertical and horizontal charts cleanly and falls back on branches', () => {
  const data = parseGedcom(DEMO_TEXT);
  for (const lang of ['he', 'en']) {
    for (const ancestorOrientation of ['vertical', 'horizontal']) {
      const svg = createPedigreeSvg(data, '@I1@', { mode: 'ancestors', generations: 4, ancestorOrientation, lang, date });
      assert.match(svg, /data-layout="ancestor-tree"/);
      const { people, lines } = chartGeometry(svg);
      const boxes = [...people.values()];
      for (let i = 0; i < boxes.length; i++) for (let j = 0; j < i; j++) {
        const a = boxes[i], b = boxes[j];
        assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
      }
      for (let i = 0; i < lines.length; i++) for (let j = 0; j < i; j++) {
        const a = lines[i], b = lines[j];
        const sharedPartner = a.type === 'partner' && b.type === 'partner' && a.person === b.person;
        if (a.family !== b.family && !sharedPartner) assert.ok(!segmentsTouch(a.a, a.b, b.a, b.b));
      }
      if (ancestorOrientation === 'horizontal') {
        if (lang === 'he') assert.ok(people.get('@I1@').x > people.get('@I2@').x && people.get('@I2@').x > people.get('@I10@').x);
        else assert.ok(people.get('@I1@').x < people.get('@I2@').x && people.get('@I2@').x < people.get('@I10@').x);
      } else {
        if (lang === 'he') assert.ok(people.get('@I2@').x > people.get('@I3@').x);
        else assert.ok(people.get('@I2@').x < people.get('@I3@').x);
      }
      assert.ok(new Resvg(svg).render().width > 0);
    }
  }
  const branched = createPedigreeSvg(data, '@I1@', { mode: 'ancestors', generations: 4, includeBranches: true, lang: 'he', date });
  assert.match(branched, /data-layout="graph"/);
});

test('marriage years and generation labels render cleanly in descendants and ancestors charts', () => {
  const data = parseGedcom(DEMO_TEXT);
  const desc = createPedigreeSvg(data, '@I2@', { mode: 'descendants', generations: 3, showMarriageYears: true, showGenerationLabels: true, lang: 'he', date });
  assert.match(desc, /class="marriage-year"[^>]*>נ׳ 1979<\/text>/);
  assert.match(desc, /class="marriage-year"[^>]*>נ׳ 2009<\/text>/);
  assert.match(desc, /class="generation-guides"/);
  assert.match(desc, />דור 1<\/text>/);
  assert.match(desc, />דור 3<\/text>/);
  assert.ok(new Resvg(desc).render().width > 0);

  const ancH = createPedigreeSvg(data, '@I1@', { mode: 'ancestors', generations: 4, ancestorOrientation: 'horizontal', showMarriageYears: true, showGenerationLabels: true, lang: 'en', date });
  assert.match(ancH, /class="marriage-year"[^>]*>m\. 1979<\/text>/);
  assert.match(ancH, />Gen 1<\/text>/);
  assert.match(ancH, />Gen 4<\/text>/);
  assert.match(ancH, />Children<\/text>/);
  assert.ok(new Resvg(ancH).render().width > 0);
});

test('profile photos embed only validated raster data URLs when enabled', () => {
  const data = parseGedcom(DEMO_TEXT);
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const withPhotos = createPedigreeSvg(data, '@I2@', {
    mode: 'descendants',
    generations: 3,
    showPhotos: true,
    photos: {
      '@I2@': tinyPng,
      '@I14@': tinyPng,
      '@I3@': 'https://evil.example.com/p.png',
      '@I6@': 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    },
    lang: 'he',
    date,
  });
  assert.equal((withPhotos.match(/<image /g) || []).length, 2);
  assert.equal((withPhotos.match(/<clipPath /g) || []).length, 2);
  assert.doesNotMatch(withPhotos, /evil\.example\.com|image\/svg\+xml/);
  assert.ok(new Resvg(withPhotos).render().width > 0);

  const disabled = createPedigreeSvg(data, '@I2@', { mode: 'descendants', generations: 3, showPhotos: false, photos: { '@I2@': tinyPng }, lang: 'he', date });
  assert.doesNotMatch(disabled, /<image |<clipPath /);
});

test('page orientation resolution, poster tiling, and connectedLineage work accurately', () => {
  const data = parseGedcom(DEMO_TEXT);
  // Build a 5-generation binary ancestor tree: 16 top leaves makes horizontal mode taller than wide.
  const binPeople = [];
  const binFams = [];
  for (let i = 1; i <= 31; i++) binPeople.push(`0 @N${i}@ INDI\n1 NAME Ancestor${i}\n1 SEX ${i % 2 ? 'F' : 'M'}`);
  for (let i = 1; i <= 15; i++) binFams.push(`0 @BF${i}@ FAM\n1 HUSB @N${2 * i}@\n1 WIFE @N${2 * i + 1}@\n1 CHIL @N${i}@`);
  const fiveGenData = parseGedcom(wrap(`${binPeople.join('\n')}\n${binFams.join('\n')}`));
  const tall = createPedigreeSvg(fiveGenData, '@N1@', { mode: 'ancestors', generations: 5, ancestorOrientation: 'horizontal', lang: 'he', date });
  const wide = createPedigreeSvg(data, '@I1@', { mode: 'ancestors', generations: 4, ancestorOrientation: 'vertical', lang: 'he', date });
  assert.equal(resolveChartPage(tall, 'A4', 'auto').orientation, 'portrait');
  assert.equal(resolveChartPage(wide, 'A4', 'auto').orientation, 'landscape');
  assert.equal(resolveChartPage(wide, 'A4', 'portrait').width, 210);

  const singlePt = chartPrintNameSize(wide, 'A4', { orientation: 'landscape', posterPages: '1x1' });
  const posterPt = chartPrintNameSize(wide, 'A4', { orientation: 'landscape', posterPages: '2x2' });
  assert.ok(Math.abs(posterPt - singlePt * 2) < 0.05);

  const tiles = createPosterTileSvgs(wide, { cols: 2, rows: 2 });
  assert.equal(tiles.length, 4);
  for (const tile of tiles) {
    assert.ok(tile.svg.includes(`${tile.index}/4`));
    assert.ok(new Resvg(tile.svg).render().width > 0);
  }

  const model = buildPedigreeGraph(data, '@I1@', { mode: 'ancestors', generations: 3, includeBranches: true });
  const lineage = connectedLineage(model, '@I1@');
  assert.ok(lineage.people.has('@I1@') && lineage.people.has('@I2@') && lineage.people.has('@I10@') && lineage.people.has('@I6@') && lineage.people.has('@I7@'));
  assert.ok(!lineage.people.has('@I14@') && !lineage.people.has('@I16@'));
});
