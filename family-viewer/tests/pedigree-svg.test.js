import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGedcom } from '../src/gedcom.js';
import { DEMO_TEXT } from '../src/demo.js';
import { buildPedigreeGraph, chartPrintNameSize, createPedigreeSvg, wrapChartText } from '../src/pedigree-svg.js';
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
  for (const [id, sex, radius] of [['@K1@','M',2], ['@K2@','F',15], ['@K3@','other',6]]) {
    const pattern = new RegExp(`class="person" data-person-id="${id}" data-compact="true"><rect[^>]*rx="${radius}" data-sex="${sex}"`);
    assert.match(svg, pattern);
    assert.equal((svg.match(new RegExp(`class="person" data-person-id="${id}"`, 'g')) || []).length, 1);
  }
  assert.ok(new Resvg(svg).render().width > 0);
});
