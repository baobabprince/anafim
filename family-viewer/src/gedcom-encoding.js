// Byte-based GEDCOM encoding detection. No network or statistical guessing from filenames.
const anselMarks = {225:'\u0300',226:'\u0301',227:'\u0302',228:'\u0303',229:'\u0304',230:'\u0306',231:'\u0307',232:'\u0308',233:'\u030c',234:'\u030a',235:'\u0361',236:'\u0361',237:'\u0315',238:'\u030b',239:'\u0310',240:'\u0327',241:'\u0328',242:'\u0323',243:'\u0324',244:'\u0325',245:'\u0333',246:'\u0332',247:'\u0326',248:'\u031c',249:'\u032e',250:'\u0360',251:'\u0360',254:'\u0313'};
const anselChars = {161:'Ł',162:'Ø',163:'Đ',164:'Þ',165:'Æ',166:'Œ',167:'ʹ',168:'·',169:'♭',170:'®',171:'±',172:'Ơ',173:'Ư',174:'ʼ',176:'ʻ',177:'ł',178:'ø',179:'đ',180:'þ',181:'æ',182:'œ',183:'ʺ',184:'ı',185:'£',186:'ð',188:'ơ',189:'ư',192:'°',193:'ℓ',194:'℗',195:'©',196:'♯',197:'¿',198:'¡',207:'ß'};
function decodeAnsel(bytes) {
  let result = '', marks = '';
  for (const b of bytes) {
    if (anselMarks[b]) { marks += anselMarks[b]; continue; }
    const c = b < 128 ? String.fromCharCode(b) : (anselChars[b] || '�');
    result += c + marks;
    marks = '';
  }
  return (result + marks).normalize('NFC');
}


const HEADER_LIMIT = 256 * 1024;
const legacyEncodings = new Set(['ansel','windows-1255','windows-1252']);
function bytesOf(buffer) {
  // Preserve offsets for Buffer, typed-array slices and DataView callers.
  return ArrayBuffer.isView(buffer) ? new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength) : new Uint8Array(buffer);
}
function charsetLabel(value='') {
  const key=String(value).trim().replace(/^["']|["']$/g,'').toUpperCase().replace(/[\s_-]/g,'');
  if(['UTF8','UTF8BOM','CP65001','WINDOWS65001'].includes(key))return 'utf-8';
  if(['UNICODE','UTF16'].includes(key))return 'utf-16';
  if(['UTF16LE','UNICODELE'].includes(key))return 'utf-16le';
  if(['UTF16BE','UNICODEBE'].includes(key))return 'utf-16be';
  if(['WINDOWS1255','CP1255','ANSI1255','1255','HEBREW'].includes(key))return 'windows-1255';
  if(['WINDOWS1252','CP1252','ANSI1252','1252'].includes(key))return 'windows-1252';
  if(key==='ANSEL')return 'ansel';
  if(['ASCII','USASCII'].includes(key))return 'ascii';
  return null;
}
function headerCharset(text) {
  let inHead=false;
  for(const line of text.slice(0,HEADER_LIMIT).replace(/^\uFEFF/,'').split(/\r\n|\n|\r/)) {
    const m=line.match(/^\s*(\d+)[ \t]+(?:(@[^@]+@)[ \t]+)?([A-Za-z0-9_]+)(?:[ \t]+(.*))?$/);
    if(!m)continue;
    const level=Number(m[1]),tag=m[3].toUpperCase();
    if(level===0){if(inHead)break;if(tag==='HEAD')inHead=true;continue;}
    if(inHead&&level===1&&tag==='CHAR')return (m[4]||'').trim().slice(0,100);
  }
  return '';
}
function bomEncoding(b) {
  if((b[0]===0xff&&b[1]===0xfe&&b[2]===0&&b[3]===0)||(b[0]===0&&b[1]===0&&b[2]===0xfe&&b[3]===0xff))throw new Error('UTF-32 אינו נתמך. ייצאו את הקובץ מתוכנת המקור ב־UTF-8.');
  if(b[0]===0xef&&b[1]===0xbb&&b[2]===0xbf)return 'utf-8';
  if(b[0]===0xff&&b[1]===0xfe)return 'utf-16le';
  if(b[0]===0xfe&&b[1]===0xff)return 'utf-16be';
  return null;
}
function utf16Structure(b) {
  const size=Math.min(b.length-b.length%2,8192);
  if(size<12)return null;
  let zeroes=0;for(let i=0;i<Math.min(size,256);i++)if(b[i]===0)zeroes++;
  if(zeroes<3)return null;
  for(const encoding of ['utf-16le','utf-16be']) {
    const prefix=new TextDecoder(encoding).decode(b.subarray(0,size));
    if(/^\s*0[ \t]+(?:HEAD(?:[ \t\r\n]|$)|@[^@\r\n]+@[ \t]+(?:INDI|FAM)\b)/i.test(prefix))return encoding;
  }
  return null;
}
function utf8Profile(b) {
  let invalidBytes=0,multibyteBytes=0,sequences=0;
  for(let i=0;i<b.length;) {
    const c=b[i];if(c<0x80){i++;continue;}
    const size=c>=0xc2&&c<=0xdf?2:c>=0xe0&&c<=0xef?3:c>=0xf0&&c<=0xf4?4:0;
    let valid=!!size&&i+size<=b.length;
    if(valid)for(let j=1;j<size;j++)if(b[i+j]<0x80||b[i+j]>0xbf){valid=false;break;}
    if(valid&&((c===0xe0&&b[i+1]<0xa0)||(c===0xed&&b[i+1]>0x9f)||(c===0xf0&&b[i+1]<0x90)||(c===0xf4&&b[i+1]>0x8f)))valid=false;
    if(valid){sequences++;multibyteBytes+=size;i+=size;}else{invalidBytes++;i++;}
  }
  return {invalidBytes,multibyteBytes,sequences};
}
function mostlyUtf8(p) {
  // Count evidence among non-ASCII bytes, not among millions of ASCII tags.
  // A few accidental byte pairs in a legacy file are not enough to switch it.
  return p.sequences>=4&&p.invalidBytes<=Math.max(2,Math.floor(p.multibyteBytes*.01))&&p.multibyteBytes/Math.max(1,p.multibyteBytes+p.invalidBytes)>=.9;
}
function legacyFallback(b) {
  let high=0,hebrew=0,run=0,longestRun=0;
  for(const c of b.subarray(0,65536)) {
    if(c>=128)high++;
    if(c>=0xe0&&c<=0xfa){hebrew++;run++;longestRun=Math.max(longestRun,run);}else run=0;
  }
  // A Western name with three isolated accents is not a Hebrew word.
  return hebrew>=3&&longestRun>=2&&hebrew/Math.max(1,high)>.65?'windows-1255':'windows-1252';
}
function agrees(declared,encoding,text) {
  return declared===encoding||(declared==='utf-16'&&encoding.startsWith('utf-16'))||(declared==='ascii'&&encoding==='utf-8'&&!/[^\x00-\x7f]/.test(text));
}

export function decodeGedcom(buffer,requested='auto') {
  const bytes=bytesOf(buffer),automatic=String(requested||'auto').trim().toLowerCase()==='auto';
  const bom=bomEncoding(bytes);let encoding,reason,strictUtf8,profile,decoded;
  const getProfile=()=>profile||(profile=utf8Profile(bytes));
  const rawHeader=new TextDecoder('windows-1252').decode(bytes.subarray(bom==='utf-8'?3:0,HEADER_LIMIT));
  let declared=headerCharset(rawHeader),declaredCanonical=charsetLabel(declared);
  if(!automatic) {
    encoding=charsetLabel(requested)||String(requested).trim().toLowerCase();
    if(encoding==='ascii')encoding='utf-8';
    if(encoding==='utf-16')encoding=bom?.startsWith('utf-16')?bom:'utf-16le';
    reason='manual';
  } else if(bom) {encoding=bom;reason='bom';}
  else {
    encoding=utf16Structure(bytes);
    if(encoding)reason='utf16-structure';
    else {
      try{strictUtf8=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{}
      if(strictUtf8!==undefined) {
        const unicode=/[^\x00-\x7f]/.test(strictUtf8);
        encoding=unicode||!legacyEncodings.has(declaredCanonical)?'utf-8':declaredCanonical;
        reason=unicode?'utf8-valid':legacyEncodings.has(declaredCanonical)?'declaration':'ascii-compatible';
      } else if(declaredCanonical==='utf-8') {encoding='utf-8';reason='utf8-declared';}
      else if(mostlyUtf8(getProfile())) {encoding='utf-8';reason='utf8-damaged';}
      else if(legacyEncodings.has(declaredCanonical)) {encoding=declaredCanonical;reason='declaration';}
      else {encoding=legacyFallback(bytes);reason='legacy-heuristic';}
    }
  }
  const warnings=[];
  try {
    decoded=encoding==='ansel'?decodeAnsel(bytes):encoding==='utf-8'&&strictUtf8!==undefined?strictUtf8:new TextDecoder(encoding).decode(bytes);
  } catch {throw new Error('הקידוד שנבחר אינו נתמך. נסו לבחור קידוד אחר.');}
  decoded=decoded.replace(/^\uFEFF/,'');
  // Read the declaration again after proper UTF-16/UTF-8 decoding.
  declared=headerCharset(decoded)||declared;declaredCanonical=charsetLabel(declared);
  if(declaredCanonical&&!agrees(declaredCanonical,encoding,decoded))warnings.push(`הצהרת הקידוד CHAR בקובץ היא ${declared}, אך הקובץ נקרא ב־${encoding.toUpperCase()}${automatic?' לפי בדיקת הבתים':' לפי הבחירה הידנית'}. בדקו שהשמות מוצגים כראוי; הצהרת המקור לא שונתה.`);
  if(bom&&encoding!==bom)warnings.push(`בקובץ יש BOM של ${bom.toUpperCase()}, אך נבחר ידנית ${encoding.toUpperCase()}. אם השמות משובשים, נסו זיהוי אוטומטי.`);
  let invalidBytes=0;
  if(encoding==='utf-8') {
    invalidBytes=strictUtf8!==undefined?0:getProfile().invalidBytes;
    if(invalidBytes)warnings.push(`נמצאו ${invalidBytes} בתים שאינם תקינים ב־UTF-8. שאר הקובץ נשמר ב־UTF-8, אך תווים פגומים הוחלפו ב־�. הקובץ המקורי במכשיר לא שונה; מומלץ לייצא אותו מחדש ב־UTF-8.`);
  } else if(encoding.startsWith('utf-16')) {
    try{new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{warnings.push('נמצאו בתים או זוגות Unicode פגומים ב־UTF-16; ייתכנו תווי החלפה. הקובץ המקורי במכשיר לא שונה.');}
  } else if(encoding==='ansel') {
    for(const b of bytes)if(b>=128&&!anselMarks[b]&&!anselChars[b])invalidBytes++;
    if(invalidBytes)warnings.push(`נמצאו ${invalidBytes} בתים שאינם נתמכים במיפוי ANSEL. ייתכנו תווי החלפה; אפשר לנסות לבחור קידוד אחר.`);
  }
  if(reason==='legacy-heuristic')warnings.push(`הקובץ אינו UTF-8 תקין ולא נמצאה הצהרת קידוד נתמכת. נבחר ${encoding.toUpperCase()} לפי מאפייני הבתים; אם השמות משובשים, בחרו קידוד ידנית.`);
  return {text:decoded,encoding,warnings,encodingInfo:{mode:automatic?'auto':'manual',reason,declared,bom,invalidBytes}};
}
