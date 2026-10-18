import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Network, UsersRound, Upload, Search, ChevronDown, ChevronLeft, ChevronRight, ArrowUpLeft, FileText, ShieldCheck, X, Menu, MapPin, CalendarDays, BriefcaseBusiness, Heart, GitFork, HelpCircle, Printer, Download, Check, AlertTriangle, LoaderCircle, Home, Layers3, Leaf, Sprout, LockKeyhole, Info, RotateCcw, Baby, Flower2, CornerDownLeft, MousePointer2, ArrowRight, ArrowLeft, Clock3 } from 'lucide-react';
import { createPortal } from 'react-dom';
import FamilyView from './FamilyExperience.jsx';
import CloudAccess from './CloudAccess.jsx';
import { DEMO_TEXT, DEMO_ROOT } from './demo.js';
import { importGedcomFile, MAX_FILE_BYTES } from './import-gedcom.js';
import { parseGedcom, parseGedcomAsync, getRelations, formatDate, lifeLabel, initials, normalize, getYear, pedigreeLabel } from './gedcom.js';

const CACHE_KEY = 'anafim-gedcom-v1';
const APP_VERSION = '2.0.1';
const number = n => n.toLocaleString('he-IL');
const viewNames = { family:'מבט משפחתי', people:'כל האנשים', file:'פרטי הקובץ' };
function demoBundle() { return { data:parseGedcom(DEMO_TEXT), raw:DEMO_TEXT, filename:'משפחת-לוין.ged', encoding:'utf-8', isDemo:true, remembered:false }; }
function initialBundle() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (saved?.raw) return { ...saved, data:parseGedcom(saved.raw), isDemo:false, remembered:true };
  } catch { /* A blocked or full local store never prevents opening the viewer. */ }
  return demoBundle();
}

function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}><span className="brand-mark"><svg viewBox="0 0 44 44" fill="none" aria-hidden="true"><path d="M22 34V17m0 9L12 16m10 7L32 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M12 18C4 17 5 9 5 9s9 0 9 7m18-1c8-1 7-9 7-9s-9 1-9 8M22 19c-7-4-4-12-4-12s8 3 6 10" fill="currentColor"/></svg></span><div><span className="brand-name">ענפים<span className="brand-dot">.</span></span>{!compact && <span className="brand-tagline">הסיפור שמחבר בינינו</span>}</div></div>;
}
function Avatar({ person, size = 'md', className = '' }) {
  const tone = person?.sex === 'F' ? 'clay' : person?.sex === 'M' ? 'sage' : 'sand';
  return <span className={`avatar avatar-${size} avatar-${tone} ${className}`} aria-hidden="true">{initials(person)}</span>;
}
function MiniTree() {
  return <svg className="mini-tree" viewBox="0 0 170 110" fill="none" aria-hidden="true"><path d="M85 102V55M85 78 55 49M85 63l28-28M55 49V27M112 35V18M55 39 36 25" stroke="#789084" strokeWidth="1.5" strokeLinecap="round"/><path d="M49 30C32 28 36 11 36 11s18 3 17 17M58 51c-1-16 15-20 15-20s4 18-12 22M112 35c-3-17 13-24 13-24s7 18-10 26M82 63C66 56 72 39 72 39s20 8 13 24M88 79c1-18 21-20 21-20s1 20-19 22" fill="#c3d0c2"/><circle cx="36" cy="24" r="4" fill="#b57d5d"/><circle cx="56" cy="18" r="5" fill="#b57d5d"/><circle cx="113" cy="12" r="4" fill="#b57d5d"/><path d="M64 103h42" stroke="#a6b4a3" strokeLinecap="round"/></svg>;
}

function Dialog({ title, subtitle, children, onClose, className = '' }) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); }
      if (e.key === 'Tab') {
        const list = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')].filter(el => el.offsetParent !== null);
        if (!list.length) { e.preventDefault(); return; }
        const first = list[0], last = list.at(-1);
        if (e.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !ref.current.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey);
    ref.current?.querySelector('button')?.focus();
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', handleKey); previous?.focus?.(); };
  }, []);
  return createPortal(<div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className={`dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={ref}><button className="icon-button dialog-close" onClick={onClose} aria-label="סגירה"><X size={20}/></button><div className="dialog-heading"><span className="dialog-icon"><Sprout size={26}/></span><h2 id="dialog-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{children}</section></div>, document.body);
}

function UploadDialog({ onClose, onImport, onDemo }) {
  const [file, setFile] = useState(null), [encoding, setEncoding] = useState('auto'), [remember, setRemember] = useState(true), [error, setError] = useState(''), [dragging, setDragging] = useState(false), [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [phase, setPhase] = useState('reading');
  const inputRef = useRef(null), abortRef = useRef(null);
  useEffect(() => () => { abortRef.current?.abort(); }, []);
  const pickFile = f => {
    setError('');
    if (!f) return;
    if (/\.pdf$/i.test(f.name)) { setError({ message:'זהו קובץ PDF. יש לבחור קובץ GEDCOM בסיומת ‎.ged או ‎.gedcom.', code:'PDF_NOT_GEDCOM' }); setFile(null); return; }
    if (f.size > MAX_FILE_BYTES) { setError({ message:'הקובץ גדול מ־30MB. נסו לייצא אילן מצומצם יותר מתוכנת המקור.', code:'FILE_TOO_LARGE' }); setFile(null); return; }
    if (!f.size) { setError({ message:'הקובץ שבחרתם ריק.', code:'EMPTY_FILE' }); setFile(null); return; }
    setFile(f);
  };
  const importFile = async () => {
    if (!file || busy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true); setError(''); setProgress(1); setPhase('reading');
    try {
      const result = await importGedcomFile(file, {
        encoding,
        signal: controller.signal,
        onProgress: setProgress,
        onPhase: setPhase,
        workerFactory: () => new Worker(new URL('./gedcom.worker.js', import.meta.url), { type:'module' }),
      });
      if (!controller.signal.aborted) onImport({ ...result, filename:file.name, isDemo:false, remembered:remember, importedAt:new Date().toISOString() });
    } catch (error) {
      if (controller.signal.aborted || error.name === 'AbortError') return;
      setBusy(false);
      setError({ message:error.message || 'לא הצלחנו לקרוא את הקובץ.', code:error.code || 'IMPORT_FAILED' });
    }
  };
  const phaseLabels = {
    reading:'קוראים את הקובץ מהמכשיר…',
    background:'מפענחים את הסיפור המשפחתי…',
    parsing:'מחברים בין הענפים…',
    compatibility:'טוענים במצב תאימות לדפדפן…',
  };
  return <Dialog title="לכל משפחה יש סיפור" subtitle="פתחו את קובץ ה־GEDCOM שלכם, והתחילו לגלות את החיבורים." onClose={onClose} className="upload-dialog">
    <div className={`drop-zone ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`} onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); if (!busy) pickFile(e.dataTransfer.files[0]); }}>
      <span className="drop-icon">{file ? <FileText size={28}/> : <Upload size={28}/>}</span>
      {file ? <><strong dir="auto">{file.name}</strong><span>{number(Math.max(1, Math.round(file.size / 1024)))} KB · מוכן לפתיחה</span></> : <><strong>גררו את הסיפור המשפחתי שלכם לכאן</strong><span>קובצי GEDCOM בלבד · עד 30MB</span></>}
      <button className="button button-white button-small" disabled={busy} onClick={() => inputRef.current?.click()}>{file ? 'בחירת קובץ אחר' : 'בחירת קובץ מהמכשיר'}<ChevronLeft size={15}/></button>
      <input ref={inputRef} type="file" accept=".ged,.gedcom,.txt,application/x-gedcom,text/plain,application/octet-stream" aria-label="בחירת קובץ GEDCOM" onChange={e => pickFile(e.target.files[0])} className="visually-hidden" disabled={busy}/>
    </div>
    <div className="encoding-field"><label htmlFor="encoding">קידוד הקובץ</label><select id="encoding" value={encoding} onChange={e => setEncoding(e.target.value)} disabled={busy}><option value="auto">זיהוי אוטומטי (מומלץ)</option><option value="utf-8">UTF-8</option><option value="windows-1255">עברית · Windows-1255</option><option value="utf-16le">UTF-16 LE</option><option value="utf-16be">UTF-16 BE</option><option value="ansel">ANSEL</option><option value="windows-1252">Windows-1252</option></select><span>השמות נראים משובשים? נסו לבחור קידוד אחר.</span></div>
    <label className="checkbox-label"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} disabled={busy}/><span>לזכור עותק לא מוצפן בדפדפן הזה<span className="field-hint">ברירת מחדל: שמירה במכשיר זה. במכשיר משותף מומלץ לכבות. אפשר למחוק מפרטי הקובץ.</span></span></label>
    {error && <div className="error-message" role="alert"><AlertTriangle size={18}/><span>{typeof error === 'string' ? error : error.message}{error.code && <small className="import-error-code">קוד שגיאה: <bdi>{error.code}</bdi></small>}</span></div>}
    {busy && <div className="import-progress" role="status"><div><span>{phaseLabels[phase]}</span><span>{progress}%</span></div><progress value={progress} max="100"/></div>}
    <button className="button button-primary button-full" onClick={importFile} disabled={!file || busy}>{busy ? <LoaderCircle className="spin" size={19}/> : <Network size={19}/>}<span>{busy ? phaseLabels[phase] : 'פתיחת האילן שלי'}</span>{!busy && <ArrowLeft size={17}/>}</button>
    <div className="import-privacy"><ShieldCheck size={16}/><span>הקובץ מפוענח במכשיר. רק אם הפעלתם סנכרון בענן, יישמר גם עותק מוצפן.</span></div>
    {!busy && <button className="text-button demo-link" onClick={onDemo}>רק רוצים להתרשם? גלו את משפחת ההדגמה<ChevronLeft size={14}/></button>}
  </Dialog>;
}

function SearchBar({ data, query, setQuery, onSelect, onDirectory }) {
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const input = useRef(null), wrapper = useRef(null);
  const results = useMemo(() => { const terms = normalize(query).split(' ').filter(Boolean); return terms.length ? data.order.filter(id => terms.every(t => data.people[id].search.includes(t))).slice(0, 7).map(id => data.people[id]) : []; }, [query, data]);
  const total = useMemo(() => { const terms = normalize(query).split(' ').filter(Boolean); return terms.length ? data.order.filter(id => terms.every(t => data.people[id].search.includes(t))).length : 0; }, [query, data]);
  useEffect(() => { setActive(-1); }, [query]);
  useEffect(() => {
    const key = e => {
      if ((e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key === 'k')) && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) { e.preventDefault(); input.current?.focus(); }
    };
    const outside = e => { if (!wrapper.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', outside); };
  }, []);
  const choose = p => { onSelect(p.id); setQuery(''); setOpen(false); input.current?.blur(); };
  const showResults = () => { onDirectory(); setOpen(false); input.current?.blur(); };
  return <div className="search-wrapper" ref={wrapper}><div className={`search-bar ${open ? 'search-focused' : ''}`}><Search size={20} className="search-icon"/><input ref={input} type="search" placeholder="את מי תרצו להכיר? חפשו שם, מקום או שנה" value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} aria-label="חיפוש אדם לפי שם, מקום או שנה" role="combobox" aria-expanded={open && !!query.trim()} aria-autocomplete="list" aria-controls="search-results" aria-activedescendant={active >= 0 ? `search-result-${active}` : undefined} onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(i => Math.min(i + 1, results.length - 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); } if (e.key === 'Escape') { setOpen(false); input.current?.blur(); } if (e.key === 'Enter') { e.preventDefault(); if (active >= 0 && results[active]) choose(results[active]); else showResults(); } }}/>{query ? <button className="icon-button search-clear" onClick={() => { setQuery(''); input.current?.focus(); }} aria-label="ניקוי החיפוש"><X size={17}/></button> : <kbd className="search-shortcut">/</kbd>}<div className="search-divider"/><button className="search-directory" onClick={showResults} aria-label="הצגת כל האנשים"><UsersRound size={17}/><span>כל האנשים</span><span className="search-count">{number(data.stats.people)}</span><ChevronLeft size={16}/></button></div>
    {open && query.trim() && <div className="search-results" id="search-results" role="listbox" aria-label="תוצאות חיפוש"><div className="search-results-heading">{total ? `${number(total)} אנשים מתאימים` : 'עוד לא מצאנו התאמה'}</div>{results.map((p,i) => <button id={`search-result-${i}`} key={p.id} role="option" aria-selected={active === i} className={`search-result ${active === i ? 'is-active' : ''}`} onClick={() => choose(p)}><Avatar person={p} size="sm"/><span><strong>{p.name}</strong><small>{lifeLabel(p)}{p.birth?.place ? ` · ${p.birth.place}` : ''}</small></span><CornerDownLeft size={16}/></button>)}{!results.length && <div className="search-empty"><Search size={25}/><p>נסו שם אחר, שם משפחה או מקום לידה.</p></div>}{!!total && <button className="all-results" onClick={showResults}>הצגת כל התוצאות<ArrowLeft size={15}/></button>}</div>}
  </div>;
}

function PeopleView({ data, query, setQuery, onSelect }) {
  const [filter,setFilter] = useState('all'), [sort,setSort] = useState('name'), [limit,setLimit] = useState(40);
  useEffect(() => setLimit(40), [query, filter, sort, data]);
  const people = useMemo(() => {
    const terms = normalize(query).split(' ').filter(Boolean);
    return data.order.map(id => data.people[id]).filter(p => (filter === 'all' || p.sex === filter) && terms.every(t => p.search.includes(t))).sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name,'he') : (getYear(a.birth?.date) || 9999) - (getYear(b.birth?.date) || 9999));
  }, [data, query, filter, sort]);
  return <section className="directory-view"><div className="workspace-heading"><div className="view-heading"><h2>{query ? 'תוצאות החיפוש' : 'הפנים של המשפחה'}</h2><span className="count-pill">{number(people.length)}</span></div><label className="sort-label">מיון לפי<select value={sort} onChange={e => setSort(e.target.value)} aria-label="מיון אנשים"><option value="name">שם פרטי</option><option value="birth">שנת לידה</option></select></label></div><div className="directory-filters"><div className="segmented-control"><button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>כולם <span>{number(data.stats.people)}</span></button><button className={filter === 'F' ? 'selected' : ''} onClick={() => setFilter('F')}>נשים <span>{number(data.stats.women)}</span></button><button className={filter === 'M' ? 'selected' : ''} onClick={() => setFilter('M')}>גברים <span>{number(data.stats.men)}</span></button></div>{query && <button className="text-button" onClick={() => setQuery('')}>ניקוי החיפוש<X size={14}/></button>}<span className="directory-hint">כל שם הוא התחלה של סיפור</span></div><div className="people-grid">{people.slice(0,limit).map(p => <button className="directory-person" key={p.id} onClick={() => onSelect(p.id)}><Avatar person={p} size="lg"/><span className="directory-person-info"><strong>{p.name}</strong><span>{lifeLabel(p)}</span><small><MapPin size={12}/>{p.birth?.place || 'מקום לידה לא צוין'}</small></span><ArrowUpLeft size={17}/></button>)}</div>{!people.length && <div className="empty-state"><Search size={35}/><h3>אין אנשים שמתאימים לחיפוש</h3><p>נסו שם אחר או חזרו להצגת כל המשפחה.</p><button className="button button-white" onClick={() => { setQuery(''); setFilter('all'); }}>הצגת כל האנשים</button></div>}{people.length > limit && <button className="button button-white load-more" onClick={() => setLimit(n => n + 60)}>הצגת אנשים נוספים<ChevronDown size={16}/></button>}</section>;
}

function FileView({ bundle, onUpload, onDownload, onDemo, onForget }) {
  const { data } = bundle;
  return <section className="file-view"><div className="workspace-heading"><div className="view-heading"><h2>הקובץ שמחבר הכול</h2></div></div><div className="file-main-card"><div className="file-summary"><span className="file-large-icon"><FileText size={34}/></span><div><span className="eyebrow">{bundle.isDemo ? 'משפחת הדגמה · נתונים בדויים' : 'הקובץ המשפחתי שלכם'}</span><h3 dir="auto">{bundle.filename}</h3><p><span className="status-dot"/>נטען בהצלחה · המידע מעובד רק במכשיר שלכם</p></div></div><div className="file-stats">{[[data.stats.people,'אנשים',UsersRound],[data.stats.families,'משפחות',Network],[data.stats.generations,'דורות',Layers3]].map(([n,label,Icon]) => <div key={label}><Icon size={20}/><strong>{number(n)}</strong><span>{label}</span></div>)}</div><dl className="metadata-list"><div><dt>גרסת GEDCOM</dt><dd dir="ltr">{data.metadata.version || 'לא צוינה'}</dd></div><div><dt>תוכנת המקור</dt><dd dir="auto">{data.metadata.source || 'לא צוינה'}</dd></div><div><dt>קידוד שנקרא</dt><dd dir="ltr">{bundle.encoding.toUpperCase()}</dd></div><div><dt>הצהרת CHAR בקובץ המקורי</dt><dd dir="auto">{data.metadata.charset || 'לא צוינה'}</dd></div>{bundle.encodingInfo && <div><dt>בחירת הקידוד</dt><dd>{bundle.encodingInfo.mode === 'manual' ? 'בחירה ידנית' : bundle.encodingInfo.reason === 'bom' ? 'זיהוי אוטומטי · BOM' : bundle.encodingInfo.reason === 'declaration' ? 'זיהוי אוטומטי · הצהרת CHAR' : bundle.encodingInfo.reason === 'legacy-heuristic' ? 'זיהוי אוטומטי · הערכת קידוד ישן' : 'זיהוי אוטומטי לפי תוכן הקובץ'}</dd></div>}<div><dt>גרסת המציג</dt><dd dir="ltr">{APP_VERSION}</dd></div>{bundle.importMethod && <div><dt>מנגנון טעינת הקובץ</dt><dd>{bundle.importMethod === 'direct' ? 'טעינה ישירה · תואם דפדפנים מוגנים' : 'עיבוד ברקע'}</dd></div>}<div><dt>שמירה במכשיר</dt><dd>{bundle.isDemo ? 'נתוני הדגמה מובנים' : bundle.remembered ? 'הקובץ שמור בדפדפן הזה' : 'למפגש הנוכחי בלבד'}</dd></div>{bundle.importedAt && <div><dt>מועד הפתיחה</dt><dd>{new Date(bundle.importedAt).toLocaleString('he-IL')}</dd></div>}</dl><div className="file-actions"><button className="button button-primary" onClick={onUpload}><Upload size={17}/>פתיחת קובץ אחר</button><button className="button button-white" onClick={onDownload}><Download size={17}/>הורדת קובץ GEDCOM</button></div></div>{!!data.warnings.length && <div className="warnings-card"><h3><AlertTriangle size={20}/>דברים שכדאי לדעת על הקובץ</h3><p>המידע שניתן לקרוא הוצג. בדקו גם אזהרות קידוד: ייתכן שיש הצהרה לא תואמת, תווים פגומים או קשרים ושדות חסרים.</p><ul>{data.warnings.map((w,i) => <li dir="auto" key={i}>{w}</li>)}</ul></div>}{data.stats.cycles && <div className="warnings-card"><h3><AlertTriangle size={18}/>נמצא קשר מעגלי באילן</h3><p>ייתכן שיש קישור שגוי בין הורה לילד בקובץ המקור. מספר הדורות עשוי להיות חלקי.</p></div>}<div className="privacy-card"><ShieldCheck size={28}/><div><h3>ההיסטוריה שלכם. הפרטיות שלכם.</h3><p>עיבוד האילן והפענוח מתבצעים בדפדפן. במצב מקומי אין העלאת קובץ. אפשר לבחור כניסה עם Google וגיבוי מוצפן מקצה לקצה; מפתח הפענוח אינו נשמר בשרת. זכירת הקובץ בדפדפן שומרת עותק מקומי לא מוצפן.</p>{bundle.remembered && <button className="text-button danger-text" onClick={onForget}>מחיקת העותק השמור מהמכשיר<X size={14}/></button>}</div></div>{!bundle.isDemo && <button className="text-button file-demo-link" onClick={onDemo}><RotateCcw size={15}/>מעבר למשפחת ההדגמה</button>}</section>;
}

function HelpDialog({ onClose, onUpload, onDownload, installPrompt, onInstall }) {
  return <Dialog title="קל למצוא את החיבור" subtitle="לא צריך לראות את כל האילן כדי להרגיש חלק ממנו." onClose={onClose} className="help-dialog"><div className="help-steps"><div><span>01</span><section><h3>פותחים את הסיפור המשפחתי</h3><p>מייצאים קובץ GEDCOM מתוכנת אילן היוחסין שלכם, ופותחים אותו כאן. קובצי ‎.ged בגרסאות 5.5, 5.5.1 ו־7 נתמכים.</p></section></div><div><span>02</span><section><h3>אדם אחד, במרכז</h3><p>הסבים והסבתות מופיעים מעל ההורים, בחלוקה לפי הצד במשפחה. האדם הנבחר והוריו מוצגים בפירוט. לחצו על הורה או סב/תא כדי לעבור למבט שלהם, או חפשו שם בשורת החיפוש.</p></section></div><div><span>03</span><section><h3>המשפחה מסביב, בלחיצה</h3><p>פתחו את רשימות בני הזוג, הילדים והאחים כדי לגלות את המעגלים הנוספים. לחיצה על שם מעבירה את המיקוד אליו.</p></section></div></div><div className="android-install-box"><div className="android-install-heading"><strong>שמירת העמוד בדף הבית באנדרואיד</strong></div><p>לגישה מהירה כמו באפליקציה: לחצו בדפדפן Chrome באנדרואיד על תפריט שלוש הנקודות <strong>⋮</strong> ובחרו <strong>״הוספה למסך הבית״</strong> (או ״התקנת האפליקציה״).</p>{installPrompt && <button className="button button-white button-small install-app-btn" onClick={onInstall}>הוספה למסך הבית בלחיצה אחת<Download size={15}/></button>}</div><div className="help-tip"><Printer size={19}/><p>רוצים לשמור רגע מהסיפור? לחצו על ״הדפסה / PDF״ ובחרו ״שמירה כ־PDF״ בחלון ההדפסה.</p></div><div className="help-actions"><button className="button button-primary" onClick={onUpload}><Upload size={17}/>פתיחת הקובץ שלי</button><button className="text-button" onClick={onDownload}><Download size={15}/>הורדת הקובץ הנוכחי</button></div></Dialog>;
}

export default function App() {
  const [bundle,setBundle] = useState(initialBundle);
  const [history,setHistory] = useState(() => ({ ids:[bundle.isDemo ? DEMO_ROOT : bundle.data.order[0]], cursor:0 }));
  const [view,setView] = useState('family'), [query,setQuery] = useState(''), [modal,setModal] = useState(null), [mobileMenu,setMobileMenu] = useState(false), [parentFamily,setParentFamily] = useState(''), [toast,setToast] = useState(''), [installPrompt,setInstallPrompt] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = e => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setToast('האפליקציה תווסף למסך הבית שלך');
    }
    setInstallPrompt(null);
  };
  const person = bundle.data.people[history.ids[history.cursor]] || bundle.data.people[bundle.data.order[0]];
  const demoSurname = bundle.isDemo ? 'משפחת לוין' : bundle.filename.replace(/\.(ged|gedcom|txt)$/i,'').replace(/[_-]/g,' ');
  useEffect(() => { document.title = `${view === 'family' ? person.name : viewNames[view]} · ענפים`; }, [person.name,view]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 5500); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => {
    if (!mobileMenu) return;
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    menuRef.current?.querySelector('button')?.focus();
    const key = e => {
      if (e.key === 'Escape') setMobileMenu(false);
      if (e.key === 'Tab') {
        const elements = [...menuRef.current.querySelectorAll('button, [tabindex="0"]')].filter(el => el.offsetParent !== null);
        if (e.shiftKey && document.activeElement === elements[0]) { e.preventDefault(); elements.at(-1)?.focus(); }
        if (!e.shiftKey && document.activeElement === elements.at(-1)) { e.preventDefault(); elements[0]?.focus(); }
      }
    };
    document.addEventListener('keydown',key);
    return () => { document.removeEventListener('keydown',key); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [mobileMenu]);
  const scrollToFamily = () => { requestAnimationFrame(() => { if (window.innerWidth < 900) document.getElementById('family-title')?.scrollIntoView({ behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block:'start' }); }); };
  const selectPerson = useCallback(id => {
    if (!bundle.data.people[id]) return;
    setHistory(h => h.ids[h.cursor] === id ? h : { ids:[...h.ids.slice(0,h.cursor + 1),id], cursor:h.cursor + 1 });
    setView('family'); setQuery(''); setParentFamily(''); setMobileMenu(false); scrollToFamily();
  }, [bundle.data]);
  const changeView = value => { setView(value); setMobileMenu(false); if (value !== 'people') setQuery(''); window.scrollTo({ top:0, behavior:'instant' }); };
  const goHistory = delta => { setHistory(h => ({ ...h, cursor:Math.min(Math.max(h.cursor + delta,0),h.ids.length - 1) })); setParentFamily(''); scrollToFamily(); };
  const resetSelection = () => { selectPerson(bundle.isDemo ? DEMO_ROOT : bundle.data.order[0]); setToast('חזרנו לאדם הראשון באילן'); };
  const loadBundle = next => {
    const result = { ...next }; delete result.type;
    if (next.remembered) {
      try { localStorage.setItem(CACHE_KEY,JSON.stringify({ raw:next.raw, filename:next.filename, encoding:next.encoding, encodingInfo:next.encodingInfo, importedAt:next.importedAt })); }
      catch { result.remembered = false; try { localStorage.removeItem(CACHE_KEY); } catch {} setToast('הקובץ נפתח, אך לא ניתן לשמור אותו בדפדפן. הוא זמין למפגש הנוכחי.'); }
    } else { try { localStorage.removeItem(CACHE_KEY); } catch { /* unavailable storage */ } }
    setBundle(result); setHistory({ ids:[result.isDemo ? DEMO_ROOT : result.data.order[0]], cursor:0 }); setQuery(''); setParentFamily(''); setView('family'); setModal(null); setMobileMenu(false); window.scrollTo({top:0,behavior:'instant'});
    if (result.data.warnings.length) setToast(`האילן נפתח עם ${number(result.data.warnings.length)} הערות. אפשר לעיין בהן בפרטי הקובץ.`);
    else if (!(next.remembered && !result.remembered)) setToast(result.isDemo ? 'נעים להכיר את משפחת לוין. כל הפרטים בדויים.' : `ברוכים הבאים! ${number(result.data.stats.people)} אנשים מחכים לכם באילן.`);
  };
  const downloadGedcom = () => {
    let raw = bundle.raw;
    if (/^1 CHAR .*$/m.test(raw)) raw = raw.replace(/^1 CHAR .*$/m,'1 CHAR UTF-8');
    else if (/^0 HEAD\s*$/m.test(raw)) raw = raw.replace(/^0 HEAD\s*$/m,'0 HEAD\n1 CHAR UTF-8');
    const url = URL.createObjectURL(new Blob([raw],{type:'text/plain;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = bundle.filename.replace(/\.(gedcom|txt)$/i,'.ged'); if (!/\.ged$/i.test(a.download)) a.download += '.ged'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  };
  const forget = () => { try { localStorage.removeItem(CACHE_KEY); setBundle(b => ({...b,remembered:false})); setToast('העותק השמור נמחק מהמכשיר. האילן פתוח עד סגירת העמוד.'); } catch { setToast('לא ניתן לגשת לאחסון הדפדפן.'); } };
  const applyCloudSnapshot = async (snapshot,options={}) => {
    const allowed=()=>!options.shouldApply || options.shouldApply();
    const cancelled=()=>{const e=new Error('העדכון בוטל כדי לשמור על האילן המקומי.');e.name='AbortError';throw e;};
    if(!snapshot.raw){if(!allowed())cancelled();loadBundle(demoBundle());return;}
    const data=await parseGedcomAsync(snapshot.raw);
    if(!allowed())cancelled();
    loadBundle({data,raw:snapshot.raw,filename:snapshot.filename,encoding:snapshot.encoding||'utf-8',isDemo:false,remembered:false,fromCloud:true,importMethod:'direct',importedAt:new Date().toISOString()});
    if(snapshot.selectedId&&Object.hasOwn(data.people,snapshot.selectedId))setHistory({ids:[snapshot.selectedId],cursor:0});
  };
  const clearCloudView = () => {
    try{localStorage.removeItem(CACHE_KEY);}catch{}
    const demo=demoBundle();setBundle(demo);setHistory({ids:[DEMO_ROOT],cursor:0});setView('family');setQuery('');setParentFamily('');setModal(null);setMobileMenu(false);
  };
  const navItems = [{id:'family',icon:Network},{id:'people',icon:UsersRound},{id:'file',icon:FileText}];
  return <div className="app-shell"><a href="#main-content" className="skip-link">דילוג לתוכן</a>{mobileMenu && <div className="sidebar-backdrop" onClick={() => setMobileMenu(false)}/>}<aside ref={menuRef} id="main-sidebar" className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`} aria-label="תפריט ראשי"><div className="sidebar-top"><button className="brand-button" onClick={() => changeView('family')} aria-label="ענפים — חזרה למבט המשפחתי"><Brand/></button><button className="icon-button sidebar-close" onClick={() => setMobileMenu(false)} aria-label="סגירת תפריט"><X size={20}/></button></div><button className="button button-primary sidebar-upload" onClick={() => { setMobileMenu(false); setModal('upload'); }}><Upload size={18}/><span>פתיחת קובץ GEDCOM</span><span className="upload-plus">+</span></button><div className="nav-label">הסיפור המשפחתי</div><nav className="main-nav">{navItems.map(({id,icon:Icon}) => <button className={`nav-item ${view === id ? 'active' : ''}`} key={id} onClick={() => changeView(id)} aria-current={view === id ? 'page' : undefined}><Icon size={19}/><span>{viewNames[id]}</span>{id === 'people' ? <span className="nav-count">{number(bundle.data.stats.people)}</span> : view === id ? <span className="active-nav-dot"/> : null}</button>)}</nav><div className="sidebar-separator"/><button className="nav-item subtle-nav" onClick={() => { setMobileMenu(false); setModal('help'); }}><HelpCircle size={19}/><span>נעים להכיר את ענפים</span><ArrowUpLeft size={14}/></button><div className="sidebar-spacer"/><section className="fx-recents" aria-label="אנשים שביקרתם באילן"><div className="fx-recents-heading"><Clock3 size={13}/><span>לאחרונה באילן</span></div>{[...new Set(history.ids.slice(0,history.cursor+1).reverse())].slice(0,3).map(id=>bundle.data.people[id]).filter(Boolean).map(p=><button key={p.id} className="fx-visited-person" onClick={()=>selectPerson(p.id)}><Avatar person={p} size="sm"/><span><strong dir="auto">{p.name}</strong><small>{lifeLabel(p)}</small></span>{p.id === person.id ? <i className="fx-visited-dot"/> : <ChevronLeft size={12}/>}</button>)}</section><div className="sidebar-file" onClick={() => changeView('file')} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); changeView('file'); } }}><span className="sidebar-file-icon"><FileText size={21}/></span><div><strong title={demoSurname}>{demoSurname}</strong><span>{bundle.isDemo ? 'אילן לדוגמה' : 'הקובץ שלכם'}<i/> {number(bundle.data.stats.generations)} דורות</span></div><ChevronLeft size={15}/></div><div className="sidebar-privacy"><ShieldCheck size={14}/><span>המשפחה שלכם. לעיניים שלכם.</span></div></aside>
    <main className="main-content" id="main-content"><header className="topbar"><div className="desktop-breadcrumb"><span>סביבת העבודה</span><ChevronLeft size={14}/><strong>{viewNames[view]}</strong></div><div className="mobile-brand"><button className="icon-button" onClick={() => setMobileMenu(true)} aria-expanded={mobileMenu} aria-controls="main-sidebar" aria-label="פתיחת תפריט"><Menu size={22}/></button><Brand compact/></div><div className="topbar-left"><button className={`demo-badge ${!bundle.isDemo ? 'real-data-badge' : ''}`} onClick={() => changeView('file')}><span/>{bundle.isDemo ? 'מציגים משפחה לדוגמה' : bundle.remembered ? 'נשמר במכשיר הזה' : 'הקובץ שלכם, באופן פרטי'}<ChevronDown size={12}/></button><span className="topbar-divider"/><button className="icon-button help-top" onClick={() => setModal('help')} aria-label="עזרה והסבר"><HelpCircle size={20}/></button></div></header><div className="page-content"><section className="page-intro"><div><div className="intro-eyebrow"><span className="eyebrow-line"/>{view === 'family' ? 'שורשים. אנשים. סיפורים.' : view === 'people' ? 'הסיפור הוא האנשים' : 'מקום אחד לכל הענפים'}</div><h1>{view === 'family' ? <>המשפחה שלכם, <em>בתמונה אחת.</em></> : view === 'people' ? <>פנים רבות. <em>משפחה אחת.</em></> : <>כל סיפור <em>מתחיל בחיבור.</em></>}</h1><p>{view === 'family' ? 'אנשים, מקומות וזיכרונות — הסיפור המשפחתי במבט קרוב.' : view === 'people' ? 'חפשו שם מוכר, או גלו סיפור שעוד לא הכרתם.' : 'כל המידע על האילן שלכם, והדרך שבה אנחנו שומרים עליו.'}</p></div><div className="intro-stats" aria-label="נתוני האילן">{[[bundle.data.stats.people,'אנשים'],[bundle.data.stats.families,'משפחות'],[bundle.data.stats.generations,'דורות']].map(([n,label]) => <div key={label}><strong>{number(n)}</strong><span>{label}</span></div>)}</div></section><CloudAccess Dialog={Dialog} bundle={bundle} selectedId={person.id} onApplySnapshot={applyCloudSnapshot} onClear={clearCloudView} onUpload={()=>setModal('upload')} isModalOpen={!!modal||mobileMenu}/><SearchBar data={bundle.data} query={query} setQuery={setQuery} onSelect={selectPerson} onDirectory={() => changeView('people')}/>{view === 'family' && <div className="focus-breadcrumb"><button className="text-button" onClick={resetSelection} aria-label="חזרה לאדם הראשון באילן"><Home size={14}/><span>{demoSurname}</span></button><ChevronLeft size={12}/><span>{person.name}</span>{!bundle.isDemo && <span className="source-file-label"><ShieldCheck size={12}/>GEDCOM · פענוח מקומי</span>}</div>}{view === 'family' ? <FamilyView data={bundle.data} person={person} bundle={bundle} onSelect={selectPerson} parentFamily={parentFamily} setParentFamily={setParentFamily} history={history} onHistory={goHistory} onHelp={() => setModal('help')}/> : view === 'people' ? <PeopleView data={bundle.data} query={query} setQuery={setQuery} onSelect={selectPerson}/> : <FileView bundle={bundle} onUpload={() => setModal('upload')} onDownload={downloadGedcom} onDemo={() => loadBundle(demoBundle())} onForget={forget}/>}<footer className="workspace-footer"><span><Sprout size={15}/>לכל משפחה יש דרך. לכל אדם יש מקום.</span><span><ShieldCheck size={13}/>פענוח הנתונים מתבצע במכשיר שלכם</span></footer></div></main><nav className="mobile-bottom-nav" aria-label="ניווט מהיר"><button className={view === 'family' ? 'selected' : ''} onClick={() => changeView('family')}><Network size={21}/><span>המשפחה</span></button><button className={view === 'people' ? 'selected' : ''} onClick={() => changeView('people')}><UsersRound size={21}/><span>כל האנשים</span></button><button className="mobile-upload" onClick={() => setModal('upload')}><span><Upload size={20}/></span><span>פתיחת קובץ</span></button><button className={view === 'file' ? 'selected' : ''} onClick={() => changeView('file')}><FileText size={21}/><span>פרטי הקובץ</span></button></nav>{modal === 'upload' && <UploadDialog onClose={() => setModal(null)} onImport={loadBundle} onDemo={() => loadBundle(demoBundle())}/>} {modal === 'help' && <HelpDialog onClose={() => setModal(null)} onUpload={() => setModal('upload')} onDownload={downloadGedcom} installPrompt={installPrompt} onInstall={handleInstallClick}/>} {toast && <div className="toast" role="status"><span className="toast-icon"><Check size={17}/></span><span>{toast}</span><button onClick={() => setToast('')} aria-label="סגירת הודעה"><X size={16}/></button></div>}<div className="print-footer">ענפים · {demoSurname} · {new Date().toLocaleDateString('he-IL')} · {bundle.isDemo ? 'נתוני הדגמה בדויים' : 'מידע פרטי מתוך קובץ GEDCOM'}</div></div>;
}
