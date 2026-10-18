import test from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {decodeGedcom,parseGedcom} from '../src/gedcom.js';
import {importGedcomFile} from '../src/import-gedcom.js';
const text=(decl='',name='תמר /בדיקה/')=>`0 HEAD\n1 SOUR ENCODING_TEST\n1 GEDC\n2 VERS 5.5.1\n${decl?`1 CHAR ${decl}\n`:''}0 @A@ INDI\n1 NAME ${name}\n0 TRLR`;
const utf8=raw=>Buffer.from(raw,'utf8');
const withBOM=b=>Buffer.concat([Buffer.from([239,187,191]),b]);
const legacy=raw=>Uint8Array.from([...raw].map(c=>c.charCodeAt(0)>=0x05d0&&c.charCodeAt(0)<=0x05ea?c.charCodeAt(0)-0x05d0+0xe0:c.charCodeAt(0)));
const person=decoded=>parseGedcom(decoded.text).people['@A@'].name;

for(const declared of ['', 'UTF-8','UTF8','UTF_8','CP65001','ANSEL','WINDOWS-1255','CP1252','UNICODE']){
 test(`valid BOM-less UTF-8 is recognized despite CHAR ${declared||'(absent)'}`,()=>{
  const r=decodeGedcom(utf8(text(declared)));
  assert.equal(r.encoding,'utf-8');assert.equal(person(r),'תמר בדיקה');
  if(['ANSEL','WINDOWS-1255','CP1252','UNICODE'].includes(declared))assert.ok(r.warnings.some(w=>w.includes('הצהרת הקידוד')));
  assert.ok(r.text.includes(`1 CHAR ${declared}`)||!declared,'The source declaration is retained, not rewritten');
 });
}
test('UTF-8 BOM takes priority over a stale legacy declaration',()=>{
 const r=decodeGedcom(withBOM(utf8(text('WINDOWS-1255'))));
 assert.equal(r.encoding,'utf-8');assert.equal(r.encodingInfo.reason,'bom');assert.equal(person(r),'תמר בדיקה');assert.equal(r.text.startsWith('\ufeff'),false);
});
test('declared UTF-8 retains intact names when a note contains malformed bytes',()=>{
 const r=decodeGedcom(Buffer.concat([utf8(text('UTF-8')+'\n0 @N@ NOTE bad '),Buffer.from([255])]));
 assert.equal(r.encoding,'utf-8');assert.equal(person(r),'תמר בדיקה');assert.equal(r.encodingInfo.invalidBytes,1);assert.ok(r.warnings.some(w=>w.includes('תווים פגומים')));
});
test('predominantly UTF-8 with no declaration tolerates isolated damage with a warning',()=>{
 const r=decodeGedcom(Buffer.concat([utf8(text()+'\n0 @N@ NOTE damaged '),Buffer.from([255])]));
 assert.equal(r.encoding,'utf-8');assert.equal(person(r),'תמר בדיקה');assert.equal(r.encodingInfo.reason,'utf8-damaged');assert.ok(r.warnings.length);
});
test('a pre-existing replacement character is not reported as an invalid UTF-8 byte',()=>{
 const r=decodeGedcom(utf8(text('UTF-8')+'\n0 @N@ NOTE literal �'));
 assert.equal(r.encodingInfo.invalidBytes,0);assert.equal(r.warnings.length,0);
});
test('UTF-8 scans the complete file, including a multibyte character across 8K and damage at the end',()=>{
 const raw=text('ANSEL')+'\n0 @N@ NOTE '+'a'.repeat(8180)+' שָׁלוֹם русский 中文 😀';
 const r=decodeGedcom(utf8(raw));assert.equal(r.text,raw);assert.equal(r.encoding,'utf-8');
 const damaged=decodeGedcom(Buffer.concat([utf8(raw),Buffer.from([255])]));assert.equal(damaged.encoding,'utf-8');assert.ok(damaged.warnings.some(w=>w.includes('פגומים')));
});
for(const endian of ['le','be']){
 test(`BOM-less UTF-16${endian.toUpperCase()} with leading whitespace is structurally detected`,()=>{
  const raw='\r\n  '+text('UNICODE');const b=Buffer.from(raw,'utf16le');if(endian==='be')b.swap16();
  const r=decodeGedcom(b);assert.equal(r.encoding,'utf-16'+endian);assert.equal(person(r),'תמר בדיקה');assert.equal(r.encodingInfo.reason,'utf16-structure');
 });
 test(`UTF-16${endian.toUpperCase()} BOM overrides stale CHAR and is reported`,()=>{
  const raw=text('UTF-8');let b=Buffer.from(raw,'utf16le');if(endian==='be')b.swap16();b=Buffer.concat([Buffer.from(endian==='le'?[255,254]:[254,255]),b]);
  const r=decodeGedcom(b);assert.equal(r.encoding,'utf-16'+endian);assert.equal(person(r),'תמר בדיקה');assert.ok(r.warnings.some(w=>w.includes('הצהרת הקידוד')));
 });
}
test('real Windows-1255 and declared ANSEL remain supported',()=>{
 const r=decodeGedcom(legacy(text('WINDOWS-1255')));assert.equal(r.encoding,'windows-1255');assert.equal(person(r),'תמר בדיקה');
 const ansel=Buffer.concat([Buffer.from(text('ANSEL','Jos').replace('\n0 TRLR','')),Buffer.from([0xe2,0x65]),Buffer.from(' /Test/\n0 TRLR')]);
 const a=decodeGedcom(ansel);assert.equal(a.encoding,'ansel');assert.ok(a.text.includes('José'));
});
test('Western accents in separate words are not mistaken for Hebrew words',()=>{
 const b=Buffer.concat([Buffer.from('0 HEAD\n1 CHAR ANSI\n0 @A@ INDI\n1 NAME J'),Buffer.from([0xe9]),Buffer.from('r'),Buffer.from([0xf4]),Buffer.from('me /Andr'),Buffer.from([0xe9]),Buffer.from('/\n0 TRLR')]);
 const r=decodeGedcom(b);assert.equal(r.encoding,'windows-1252');assert.equal(person(r),'Jérôme André');assert.ok(r.warnings.some(w=>w.includes('לפי מאפייני הבתים')));
});
test('manual selection wins and decoder reads only the provided typed-array/DataView range',()=>{
 const raw=text('UTF-8'),b=legacy(raw),pooled=new Uint8Array(b.length+12);pooled.fill(255);pooled.set(b,6);
 for(const slice of [pooled.subarray(6,6+b.length),new DataView(pooled.buffer,6,b.length)]){
  const r=decodeGedcom(slice,'windows-1255');assert.equal(person(r),'תמר בדיקה');assert.equal(r.encodingInfo.mode,'manual');assert.equal(r.text,raw);
 }
 assert.equal(decodeGedcom(utf8(text('UTF-8')),'UTF8').encoding,'utf-8');
});
test('ASCII-only content preserves a recognized legacy declaration and ignores non-header CHAR tags',()=>{
 assert.equal(decodeGedcom(utf8(text('ANSEL','Jane /Doe/'))).encoding,'ansel');
 const raw=text('','Jane /Doe/').replace('0 TRLR','1 CHAR WINDOWS-1255\n0 TRLR');
 const r=decodeGedcom(utf8(raw));assert.equal(r.encoding,'utf-8');assert.equal(r.encodingInfo.declared,'');
});
test('UTF-8 overlong, surrogate, out-of-range and truncated byte sequences produce warnings, never a silent charset switch',()=>{
 for(const bytes of [[0xc0,0xaf],[0xed,0xa0,0x80],[0xf4,0x90,0x80,0x80],[0xe2,0x82]]){
  const r=decodeGedcom(Buffer.concat([utf8(text('UTF-8')+'\n0 @N@ NOTE '),Buffer.from(bytes)]));assert.equal(r.encoding,'utf-8');assert.ok(r.encodingInfo.invalidBytes);assert.ok(r.warnings.length);assert.equal(person(r),'תמר בדיקה');
 }
});
test('a UTF-32 BOM reports an unsupported format instead of pretending UTF-16',()=>{
 assert.throws(()=>decodeGedcom(Uint8Array.from([255,254,0,0,48,0,0,0])),/UTF-32/);
});
test('direct fallback carries detection details and warnings through the real file importer',async()=>{
 const f=new File([withBOM(utf8(text('ANSEL')))],'private.ged',{type:'text/plain;charset=windows-1255'});
 const r=await importGedcomFile(f,{workerFactory:()=>{throw new DOMException('blocked','SecurityError');}});
 assert.equal(r.encoding,'utf-8');assert.equal(r.data.people['@A@'].name,'תמר בדיקה');assert.equal(r.encodingInfo.reason,'bom');assert.ok(r.data.warnings.some(w=>w.includes('הצהרת הקידוד')));
});

test('ASCII is compatible only for ASCII content, not a silent excuse for a stale header',()=>{
 const unicode=decodeGedcom(utf8(text('ASCII')));assert.equal(unicode.encoding,'utf-8');assert.ok(unicode.warnings.some(w=>w.includes('הצהרת הקידוד')));
 const ascii=decodeGedcom(utf8(text('ASCII','Jane /Doe/')));assert.equal(ascii.warnings.length,0);
 const ambiguous=Buffer.concat([Buffer.from('0 HEAD\n1 CHAR ANSEL\n0 @A@ INDI\n1 NAME '),Buffer.from([0xc3,0xa9]),Buffer.from(' /Test/\n0 TRLR')]);
 assert.equal(person(decodeGedcom(ambiguous,'ansel')),'©♭ Test');
});
