import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGedcom } from '../src/gedcom.js';
import { DEMO_TEXT } from '../src/demo.js';
import { createPedigreeSvg } from '../src/pedigree-svg.js';
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
  // Each family occupies a separate vertical band, independent of the other.
  const y = name => Number(svg.match(new RegExp(`<text class="name" x="[^"]+" y="([^"]+)"[^>]*>${name}</text>`))[1]);
  assert.ok(y('PartnerOne') < y('ChildOne') && y('ChildOne') < y('PartnerTwo') && y('PartnerTwo') < y('ChildTwo'));
});

test('XML metacharacters are escaped, missing data and cycles are safe', () => {
  const data = parseGedcom(wrap('0 @A@ INDI\n1 NAME A & <script>\n1 FAMC @F@\n0 @F@ FAM\n1 HUSB @A@\n1 CHIL @A@'));
  const svg = createPedigreeSvg(data, '@A@', opts);
  assert.match(svg, /A &amp; &lt;script&gt;/);
  assert.doesNotMatch(svg, /<script>/);
  assert.ok(new Resvg(svg).render().width > 0);
  assert.throws(() => createPedigreeSvg(data, 'missing'), /Focus person not found/);
});
