import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Network, UsersRound, Upload, Search, ChevronDown, ChevronLeft, ChevronRight, ArrowUpLeft, FileText, ShieldCheck, X, Menu, MapPin, CalendarDays, BriefcaseBusiness, Heart, GitFork, HelpCircle, Printer, Download, Check, AlertTriangle, LoaderCircle, Home, Layers3, Leaf, Sprout, LockKeyhole, Info, RotateCcw, Baby, Flower2, CornerDownLeft, MousePointer2, ArrowRight, ArrowLeft, Clock3, Wrench } from 'lucide-react';
import { createPortal } from 'react-dom';
import FamilyView from './FamilyExperience.jsx';
import CloudAccess from './CloudAccess.jsx';
import { DEMO_TEXT, DEMO_ROOT } from './demo.js';
import { importGedcomFile, MAX_FILE_BYTES } from './import-gedcom.js';
import { saveSharedExport, loadSharedExport, hasSharedExport, formatSharedSummary } from './baobab-shared-storage.js';
import { parseGedcom, parseGedcomAsync, getRelations, formatDate, lifeLabel, initials, normalize, getYear, pedigreeLabel } from './gedcom.js';

const STORAGE_FILES_KEY = 'anafim-saved-files-v1';
const STORAGE_ACTIVE_ID_KEY = 'anafim-active-file-id-v1';

function pushToBaobabShared(bundle) {
  if (!bundle || bundle.isDemo || !bundle.raw) return;
  try {
    saveSharedExport({
      source: 'anafim',
      filename: bundle.filename || 'family.ged',
      gedcom: bundle.raw,
      encoding: bundle.encoding || 'utf-8',
      meta: {
        personCount: bundle.data?.stats?.people,
        familyCount: bundle.data?.stats?.families,
        title: bundle.filename,
      },
    });
  } catch (err) {
    console.warn('baobab shared save skipped', err);
  }
}

function loadFromBaobabShared(onImport) {
  const shared = loadSharedExport();
  if (!shared?.gedcom) return null;
  try {
    const data = parseGedcom(shared.gedcom);
    const bundle = {
      id: 'shared-' + Date.now(),
      data,
      raw: shared.gedcom,
      filename: shared.filename || 'shared.ged',
      encoding: shared.encoding || 'utf-8',
      isDemo: false,
      remembered: false,
      importedAt: shared.exportedAt || new Date().toISOString(),
    };
    if (typeof onImport === 'function') onImport(bundle);
    return bundle;
  } catch (err) {
    console.error('baobab shared parse failed', err);
    return null;
  }
}

const OLD_CACHE_KEY = 'anafim-gedcom-v1';
const APP_VERSION = '2.0.2';

function getUrlDeepLink() {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = (params.get('id') || '').trim();
    const q = (params.get('q') || params.get('person') || params.get('name') || '').trim();
    return { id, q };
  } catch {
    return { id: '', q: '' };
  }
}

/** Resolve a person id from deep-link id or name query. */
function findPersonIdFromDeepLink(data, { id, q }) {
  if (!data?.people) return null;
  if (id && data.people[id]) return id;
  if (!q) return null;
  const nq = normalize(q);
  const terms = nq.split(/\s+/).filter(Boolean);
  if (!terms.length) return null;
  for (const pid of data.order) {
    const person = data.people[pid];
    if (normalize(person.name) === nq) return pid;
  }
  const hits = data.order.filter(pid => terms.every(t => data.people[pid].search.includes(t)));
  if (!hits.length) return null;
  if (hits.length === 1) return hits[0];
  const preferred = hits.find(pid => normalize(data.people[pid].name).startsWith(nq));
  if (preferred) return preferred;
  hits.sort((a, b) => data.people[a].name.length - data.people[b].name.length);
  return hits[0];
}

const number = n => n.toLocaleString('he-IL');
const viewNames = { family:'מבט משפחתי', people:'כל האנשים', file:'פרטי הקובץ' };

function demoBundle() {
  return { id:'demo', data:parseGedcom(DEMO_TEXT), raw:DEMO_TEXT, filename:'משפחת-לוין.ged', encoding:'utf-8', isDemo:true, remembered:false };
}

export function getSavedFilesList() {
  try {
    const rawList = localStorage.getItem(STORAGE_FILES_KEY);
    if (rawList) {
      const parsed = JSON.parse(rawList);
      if (Array.isArray(parsed)) return parsed;
    }
    // Migration check: check if old single file exists in localStorage
    const oldSaved = localStorage.getItem(OLD_CACHE_KEY);
    if (oldSaved) {
      const parsedOld = JSON.parse(oldSaved);
      if (parsedOld?.raw) {
        const migratedItem = {
          id: 'file-' + (parsedOld.importedAt ? new Date(parsedOld.importedAt).getTime() : Date.now()),
          filename: parsedOld.filename || 'קובץ שמור.ged',
          raw: parsedOld.raw,
          encoding: parsedOld.encoding || 'utf-8',
          encodingInfo: parsedOld.encodingInfo,
          importedAt: parsedOld.importedAt || new Date().toISOString()
        };
        const newList = [migratedItem];
        localStorage.setItem(STORAGE_FILES_KEY, JSON.stringify(newList));
        localStorage.setItem(STORAGE_ACTIVE_ID_KEY, migratedItem.id);
        localStorage.removeItem(OLD_CACHE_KEY);
        return newList;
      }
    }
  } catch { /* Local storage unavailable or disabled */ }
  return [];
}

export function saveFileToLocalStorage(fileItem) {
  try {
    const list = getSavedFilesList();
    const existingIndex = list.findIndex(f => f.id === fileItem.id || (f.filename === fileItem.filename && f.raw === fileItem.raw));
    const newItem = {
      id: fileItem.id || ('file-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)),
      filename: fileItem.filename,
      raw: fileItem.raw,
      encoding: fileItem.encoding || 'utf-8',
      encodingInfo: fileItem.encodingInfo,
      importedAt: fileItem.importedAt || new Date().toISOString()
    };
    if (existingIndex >= 0) {
      list[existingIndex] = newItem;
    } else {
      list.push(newItem);
    }
    localStorage.setItem(STORAGE_FILES_KEY, JSON.stringify(list));
    localStorage.setItem(STORAGE_ACTIVE_ID_KEY, newItem.id);
    return newItem;
  } catch (err) {
    console.error('Failed to save file to localStorage:', err);
    return null;
  }
}

export function removeFileFromLocalStorage(fileId) {
  try {
    const list = getSavedFilesList().filter(f => f.id !== fileId);
    localStorage.setItem(STORAGE_FILES_KEY, JSON.stringify(list));
    const activeId = localStorage.getItem(STORAGE_ACTIVE_ID_KEY);
    if (activeId === fileId) {
      if (list.length > 0) {
        localStorage.setItem(STORAGE_ACTIVE_ID_KEY, list[0].id);
      } else {
        localStorage.removeItem(STORAGE_ACTIVE_ID_KEY);
      }
    }
    return list;
  } catch (err) {
    console.error('Failed to remove file from localStorage:', err);
    return [];
  }
}

export function setActiveFileIdInStorage(fileId) {
  try {
    if (fileId) {
      localStorage.setItem(STORAGE_ACTIVE_ID_KEY, fileId);
    } else {
      localStorage.removeItem(STORAGE_ACTIVE_ID_KEY);
    }
  } catch { /* storage disabled */ }
}

function initialBundle() {
  try {
    const savedList = getSavedFilesList();
    if (savedList.length > 0) {
      const activeId = localStorage.getItem(STORAGE_ACTIVE_ID_KEY);
      const activeFile = savedList.find(f => f.id === activeId) || savedList[0];
      return {
        id: activeFile.id,
        filename: activeFile.filename,
        raw: activeFile.raw,
        data: parseGedcom(activeFile.raw),
        encoding: activeFile.encoding || 'utf-8',
        encodingInfo: activeFile.encodingInfo,
        importedAt: activeFile.importedAt,
        isDemo: false,
        remembered: true
      };
    }
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
      if (!controller.signal.aborted) {
        const imported = { ...result, filename:file.name, isDemo:false, remembered:remember, importedAt:new Date().toISOString() };
        onImport(imported);
        pushToBaobabShared(imported);
      }
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
    <div className="baobab-shared-box" style={{margin:'12px 0',padding:'12px',border:'1px solid #e7e8e0',borderRadius:'12px',background:'#fefefb'}}>
      <div style={{fontSize:'12px',fontWeight:600,color:'#456352',marginBottom:6}}>שיתוף בין אפליקציות</div>
      <div style={{fontSize:11,color:'#82877e',marginBottom:8}}>{formatSharedSummary(loadSharedExport()) || 'אין נתונים משותפים עדיין'}</div>
      <button type="button" className="button button-small button-full" style={{marginBottom:8}} disabled={!hasSharedExport() || busy} onClick={() => { const b = loadFromBaobabShared(onImport); if (b) { try { onClose(); } catch (_) {} } }}>
        טען מהשיתוף
      </button>
    </div>
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

function SavedFilesList({ currentBundle, onLoadSavedFile, onRemoveSavedFile, onUploadNew, onSelectDemo }) {
  const savedFiles = getSavedFilesList();
  return <div className="saved-files-card">
    <div className="saved-files-header">
      <h3><FileText size={20}/>קובצי GEDCOM שמורים בדפדפן</h3>
      <button className="button button-small button-primary" onClick={onUploadNew}><Upload size={14}/>טעינת קובץ חדש</button>
    </div>
    <div className="saved-files-list">
      {savedFiles.map(file => {
        const isActive = !currentBundle.isDemo && currentBundle.id === file.id;
        return <div key={file.id} className={`saved-file-item ${isActive ? 'is-active' : ''}`}>
          <div className="saved-file-info" onClick={() => !isActive && onLoadSavedFile(file)} role="button" tabIndex={0}>
            <span className="saved-file-icon"><FileText size={18}/></span>
            <div>
              <strong dir="auto">{file.filename}</strong>
              <span>
                {file.importedAt ? `נשמר ב־${new Date(file.importedAt).toLocaleDateString('he-IL')}` : 'קובץ שמור'}
                {isActive && <span className="active-badge">· פעיל כעת</span>}
              </span>
            </div>
          </div>
          <div className="saved-file-actions">
            {!isActive && <button className="button button-small button-white" onClick={() => onLoadSavedFile(file)}>פתיחה</button>}
            <button className="icon-button danger-icon" title="מחיקת קובץ מהמכשיר" aria-label="מחיקת קובץ" onClick={(e) => { e.stopPropagation(); onRemoveSavedFile(file.id); }}><X size={16}/></button>
          </div>
        </div>;
      })}
      <div className={`saved-file-item ${currentBundle.isDemo ? 'is-active' : ''}`}>
        <div className="saved-file-info" onClick={() => !currentBundle.isDemo && onSelectDemo()} role="button" tabIndex={0}>
          <span className="saved-file-icon demo-icon"><Sprout size={18}/></span>
          <div>
            <strong>משפחת לוין (קובץ הדגמה)</strong>
            <span>נתונים בדויים מובנים להתרשמות {currentBundle.isDemo && <span className="active-badge">· פעיל כעת</span>}</span>
          </div>
        </div>
        <div className="saved-file-actions">
          {!currentBundle.isDemo && <button className="button button-small button-white" onClick={onSelectDemo}>פתיחה</button>}
        </div>
      </div>
    </div>
  </div>;
}

function FileView({ bundle, onUpload, onDownload, onDemo, onForget, onLoadSaved, onToast }) {
  const { data } = bundle;
  const canShare = !!(bundle?.raw) && !bundle?.isDemo;

  const analysisTools = [
    {
      id: 'genea-net',
      title: 'ניתוח רשת',
      desc: 'גרף קשרים, קהילות וסטטיסטיקות',
      url: 'https://baobabprince.github.io/genea-net/',
      Icon: Network,
    },
    {
      id: 'map',
      title: 'מפת מקומות',
      desc: 'מיפוי גיאוגרפי של אירועים',
      url: 'https://baobabprince.github.io/GEDCOM-map/',
      Icon: MapPin,
    },
    {
      id: 'diff',
      title: 'השוואת קבצים',
      desc: 'השוואה בין שני קבצי GEDCOM',
      url: 'https://baobabprince.github.io/gedcom-diff-tool/',
      Icon: GitFork,
    },
    {
      id: 'shield',
      title: 'פרטיות',
      desc: 'סימון, אנונימיזציה והגנה',
      url: 'https://baobabprince.github.io/GedShield/',
      Icon: ShieldCheck,
    },
  ];

  const openTool = (url, label) => {
    if (!canShare) {
      onToast?.(bundle?.isDemo ? 'במשפחת ההדגמה אין קובץ לייצוא' : 'אין קובץ GEDCOM פתוח');
      return;
    }
    try {
      pushToBaobabShared(bundle);
    } catch (err) {
      onToast?.('לא ניתן לשמור לשיתוף');
      return;
    }
    const sep = url.includes('?') ? '&' : '?';
    window.open(url + sep + 'baobab=shared', '_blank', 'noopener,noreferrer');
    onToast?.('נפתח: ' + label);
  };

  const encodingLabel = (() => {
    if (!bundle.encodingInfo) return null;
    if (bundle.encodingInfo.mode === 'manual') return 'בחירה ידנית';
    if (bundle.encodingInfo.reason === 'bom') return 'אוטומטי · BOM';
    if (bundle.encodingInfo.reason === 'declaration') return 'אוטומטי · CHAR';
    if (bundle.encodingInfo.reason === 'legacy-heuristic') return 'אוטומטי · הערכה';
    return 'אוטומטי';
  })();

  return (
    <section className="file-view">
      <div className="workspace-heading">
        <div className="view-heading">
          <h2>פרטי הקובץ</h2>
        </div>
      </div>

      <div className="file-main-card">
        <div className="file-summary">
          <span className="file-large-icon"><FileText size={28} /></span>
          <div>
            <span className="eyebrow">
              {bundle.isDemo ? 'משפחת הדגמה' : 'קובץ GEDCOM'}
            </span>
            <h3 dir="auto">{bundle.filename}</h3>
            <p>
              <span className="status-dot" />
              {bundle.isDemo
                ? 'נתונים בדויים · לעיון בלבד'
                : 'נטען במכשיר · ללא העלאה לשרת'}
            </p>
          </div>
        </div>

        <div className="file-stats">
          {[
            [data.stats.people, 'אנשים', UsersRound],
            [data.stats.families, 'משפחות', Network],
            [data.stats.generations, 'דורות', Layers3],
          ].map(([n, label, Icon]) => (
            <div key={label}>
              <Icon size={18} />
              <strong>{number(n)}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="file-actions">
          <button type="button" className="button button-primary" onClick={onUpload}>
            <Upload size={16} />פתיחת קובץ
          </button>
          {!bundle.isDemo && (
            <button type="button" className="button button-white" onClick={onDownload}>
              <Download size={16} />הורדה
            </button>
          )}
        </div>
      </div>

      <div className="file-tools-section">
        <div className="file-tools-heading">
          <h3>ניתוח מתקדם</h3>
          <p>פתיחה בכלים אחרים עם אותו אילן · הנתונים נשארים במכשיר</p>
        </div>
        <div className="file-tools-grid">
          {analysisTools.map(({ id, title, desc, url, Icon }) => (
            <button
              key={id}
              type="button"
              className="file-tool-card"
              disabled={!canShare}
              onClick={() => openTool(url, title)}
            >
              <span className="file-tool-icon"><Icon size={20} /></span>
              <span className="file-tool-text">
                <strong>{title}</strong>
                <span>{desc}</span>
              </span>
              <ArrowLeft size={15} className="file-tool-arrow" />
            </button>
          ))}
        </div>
        {!canShare && (
          <p className="file-tools-hint">
            {bundle.isDemo
              ? 'במשפחת ההדגמה הכלים אינם זמינים. פתחו קובץ GEDCOM אמיתי.'
              : 'פתחו קובץ GEDCOM כדי להשתמש בכלים.'}
          </p>
        )}
      </div>

      <details className="file-tech-details">
        <summary>פרטים טכניים</summary>
        <dl className="metadata-list">
          <div><dt>גרסת GEDCOM</dt><dd dir="ltr">{data.metadata.version || '—'}</dd></div>
          <div><dt>תוכנת מקור</dt><dd dir="auto">{data.metadata.source || '—'}</dd></div>
          <div><dt>קידוד</dt><dd dir="ltr">{bundle.encoding?.toUpperCase?.() || '—'}</dd></div>
          {encodingLabel && <div><dt>זיהוי קידוד</dt><dd>{encodingLabel}</dd></div>}
          <div><dt>שמירה במכשיר</dt><dd>{bundle.isDemo ? 'הדגמה' : bundle.remembered ? 'שמור בדפדפן' : 'מפגש נוכחי בלבד'}</dd></div>
          {bundle.importedAt && (
            <div><dt>נפתח</dt><dd>{new Date(bundle.importedAt).toLocaleString('he-IL')}</dd></div>
          )}
          <div><dt>גרסת ענפים</dt><dd dir="ltr">{APP_VERSION}</dd></div>
        </dl>
      </details>

      <SavedFilesList
        currentBundle={bundle}
        onLoadSavedFile={onLoadSaved}
        onRemoveSavedFile={onForget}
        onUploadNew={onUpload}
        onSelectDemo={onDemo}
      />

      {!!data.warnings?.length && (
        <div className="warnings-card">
          <h3><AlertTriangle size={18} />הערות על הקובץ</h3>
          <ul>{data.warnings.map((w, i) => <li dir="auto" key={i}>{w}</li>)}</ul>
        </div>
      )}

      {data.stats.cycles && (
        <div className="warnings-card">
          <h3><AlertTriangle size={18} />קשר מעגלי באילן</h3>
          <p>ייתכן קישור שגוי בין הורה לילד. מספר הדורות עשוי להיות חלקי.</p>
        </div>
      )}

      <div className="privacy-card privacy-card-compact">
        <ShieldCheck size={22} />
        <div>
          <h3>פרטיות</h3>
          <p>הפענוח מתבצע בדפדפן. במצב מקומי הקובץ לא נשלח לשרת.</p>
        </div>
      </div>

    </section>
  );
}

function ToolsDialog({ onClose, bundle, onToast }) {
  const openTool = (url, label) => {
    if (!bundle?.raw) {
      onToast?.('אין קובץ GEDCOM פתוח להעברה');
      return;
    }
    try {
      pushToBaobabShared(bundle);
    } catch (err) {
      onToast?.('לא ניתן לשמור לשיתוף (זיכרון מלא?)');
      return;
    }
    const sep = url.includes('?') ? '&' : '?';
    window.open(url + sep + 'baobab=shared', '_blank', 'noopener,noreferrer');
    onToast?.('נפתח: ' + label + ' · הנתונים הועברו');
    onClose?.();
  };

  const tools = [
    {
      id: 'genea-net',
      title: 'ניתוח רשת (genea-net)',
      desc: 'גרף קשרים, קהילות וסטטיסטיקות על האילן',
      url: 'https://baobabprince.github.io/genea-net/',
      icon: 'Network',
    },
    {
      id: 'map',
      title: 'מפת מקומות (GEDCOM-map)',
      desc: 'מיפוי גיאוגרפי של מקומות לידה, נישואין ופטירה',
      url: 'https://baobabprince.github.io/GEDCOM-map/',
      icon: 'MapPin',
    },
    {
      id: 'diff',
      title: 'השוואת קבצים (ged-diff)',
      desc: 'השוואה בין שני קבצי GEDCOM · נטען כקובץ A',
      url: 'https://baobabprince.github.io/gedcom-diff-tool/',
      icon: 'GitFork',
    },
    {
      id: 'shield',
      title: 'פרטיות (GedShield)',
      desc: 'בדיקות פרטיות והגנה על נתונים רגישים בקובץ',
      url: 'https://baobabprince.github.io/GedShield/',
      icon: 'ShieldCheck',
    },
  ];

  return (
    <Dialog
      title="ניתוח מתקדם"
      subtitle="העברת האילן הנוכחי לכלים אחרים בלחיצה · הנתונים נשארים במכשיר"
      onClose={onClose}
      className="tools-dialog"
    >
      <div className="tools-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tools.map(tool => (
          <button
            key={tool.id}
            type="button"
            className="button button-full"
            style={{
              justifyContent: 'flex-start',
              textAlign: 'right',
              gap: 12,
              padding: '14px 16px',
              background: '#fefefb',
              border: '1px solid #e7e8e0',
              borderRadius: 12,
              color: '#29392f',
            }}
            onClick={() => openTool(tool.url, tool.title)}
            disabled={!bundle?.raw}
          >
            <span style={{ flex: 1 }}>
              <strong style={{ display: 'block', fontSize: 14, marginBottom: 4 }}>{tool.title}</strong>
              <span style={{ fontSize: 12, color: '#82877e', fontWeight: 400 }}>{tool.desc}</span>
            </span>
            <ArrowLeft size={16} style={{ opacity: 0.45, flexShrink: 0 }} />
          </button>
        ))}
      </div>
      <p style={{ fontSize: 11, color: '#82877e', marginTop: 14, lineHeight: 1.5 }}>
        הלחיצה שומרת את ה־GEDCOM ב־localStorage המשותף ופותחת את הכלי בחלון חדש.
        אם הכלי לא טוען אוטומטית — לחצו שם על «טען מהשיתוף».
      </p>
    </Dialog>
  );
}

function SidebarToolsMenu({ bundle, onDownload, onToast, closeMobileMenu }) {
  const [open, setOpen] = useState(false);
  const canShare = !!(bundle?.raw) && !bundle?.isDemo;

  const analysisTools = [
    {
      id: 'genea-net',
      title: 'ניתוח רשת',
      desc: 'גרף קשרים וקהילות',
      url: 'https://baobabprince.github.io/genea-net/',
      Icon: Network,
    },
    {
      id: 'map',
      title: 'מפת מקומות',
      desc: 'מיפוי גיאוגרפי של אירועים',
      url: 'https://baobabprince.github.io/GEDCOM-map/',
      Icon: MapPin,
    },
    {
      id: 'diff',
      title: 'השוואת קבצים',
      desc: 'השוואה בין שני קבצים',
      url: 'https://baobabprince.github.io/gedcom-diff-tool/',
      Icon: GitFork,
    },
    {
      id: 'shield',
      title: 'פרטיות (GedShield)',
      desc: 'סימון והגנה על נתונים',
      url: 'https://baobabprince.github.io/GedShield/',
      Icon: ShieldCheck,
    },
  ];

  const openTool = (url, label) => {
    if (!canShare) {
      onToast?.(bundle?.isDemo ? 'במשפחת ההדגמה אין קובץ לייצוא' : 'אין קובץ GEDCOM פתוח');
      return;
    }
    try {
      pushToBaobabShared(bundle);
    } catch (err) {
      onToast?.('לא ניתן לשמור לשיתוף');
      return;
    }
    const sep = url.includes('?') ? '&' : '?';
    window.open(url + sep + 'baobab=shared', '_blank', 'noopener,noreferrer');
    onToast?.('נפתח: ' + label);
    closeMobileMenu?.();
  };

  const handlePrint = () => {
    window.print();
    closeMobileMenu?.();
  };

  const handleDownload = () => {
    onDownload?.();
    closeMobileMenu?.();
  };

  return (
    <div className="sidebar-accordion">
      <button
        type="button"
        className={`nav-item sidebar-accordion-toggle ${open ? 'active' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-controls="sidebar-tools-submenu"
      >
        <Wrench size={19} />
        <span>כלים וניתוח</span>
        <ChevronDown size={15} className={`accordion-chevron ${open ? 'is-open' : ''}`} />
      </button>

      {open && (
        <div id="sidebar-tools-submenu" className="sidebar-submenu" role="region" aria-label="תפריט כלי ניתוח ופעולות">
          <div className="submenu-section-title">כלי ניתוח מתקדמים</div>
          {analysisTools.map(({ id, title, desc, url, Icon }) => (
            <button
              key={id}
              type="button"
              className="submenu-item"
              disabled={!canShare}
              onClick={() => openTool(url, title)}
              title={!canShare ? 'זמין רק בקובץ GEDCOM אמיתי' : title}
            >
              <Icon size={16} className="submenu-icon" />
              <div className="submenu-text">
                <strong>{title}</strong>
                <span>{desc}</span>
              </div>
              <ArrowUpLeft size={13} className="submenu-arrow" />
            </button>
          ))}

          <div className="submenu-section-title" style={{ marginTop: 8 }}>פעולות נוספות</div>
          <button
            type="button"
            className="submenu-item"
            disabled={bundle?.isDemo}
            onClick={handleDownload}
          >
            <Download size={16} className="submenu-icon" />
            <div className="submenu-text">
              <strong>הורדת GEDCOM</strong>
              <span>שמירת הקובץ הנוכחי</span>
            </div>
          </button>
          <button
            type="button"
            className="submenu-item"
            onClick={handlePrint}
          >
            <Printer size={16} className="submenu-icon" />
            <div className="submenu-text">
              <strong>הדפסה / PDF</strong>
              <span>הדפסת המבט הנוכחי</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

function HelpDialog({ onClose, onUpload, onDownload, installPrompt, onInstall }) {
  return <Dialog title="קל למצוא את החיבור" subtitle="לא צריך לראות את כל האילן כדי להרגיש חלק ממנו." onClose={onClose} className="help-dialog"><div className="help-steps"><div><span>01</span><section><h3>פותחים את הסיפור המשפחתי</h3><p>מייצאים קובץ GEDCOM מתוכנת אילן היוחסין שלכם, ופותחים אותו כאן. קובצי ‎.ged בגרסאות 5.5, 5.5.1 ו־7 נתמכים.</p></section></div><div><span>02</span><section><h3>אדם אחד, במרכז</h3><p>הסבים והסבתות מופיעים מעל ההורים, בחלוקה לפי הצד במשפחה. האדם הנבחר והוריו מוצגים בפירוט. לחצו על הורה או סב/תא כדי לעבור למבט שלהם, או חפשו שם בשורת החיפוש.</p></section></div><div><span>03</span><section><h3>המשפחה מסביב, בלחיצה</h3><p>פתחו את רשימות בני הזוג, הילדים והאחים כדי לגלות את המעגלים הנוספים. לחיצה על שם מעבירה את המיקוד אליו.</p></section></div></div><div className="android-install-box"><div className="android-install-heading"><strong>שמירת העמוד בדף הבית באנדרואיד</strong></div><p>לגישה מהירה כמו באפליקציה: לחצו בדפדפן Chrome באנדרואיד על תפריט שלוש הנקודות <strong>⋮</strong> ובחרו <strong>״הוספה למסך הבית״</strong> (או ״התקנת האפליקציה״).</p>{installPrompt && <button className="button button-white button-small install-app-btn" onClick={onInstall}>הוספה למסך הבית בלחיצה אחת<Download size={15}/></button>}</div><div className="help-tip"><Printer size={19}/><p>רוצים לשמור רגע מהסיפור? לחצו על ״הדפסה / PDF״ ובחרו ״שמירה כ־PDF״ בחלון ההדפסה.</p></div><div className="help-actions"><button className="button button-primary" onClick={onUpload}><Upload size={17}/>פתיחת הקובץ שלי</button><button className="text-button" onClick={onDownload}><Download size={15}/>הורדת הקובץ הנוכחי</button></div></Dialog>;
}

export default function App() {
  const [bundle,setBundle] = useState(initialBundle);
  const [history,setHistory] = useState(() => ({ ids:[bundle.isDemo ? DEMO_ROOT : bundle.data.order[0]], cursor:0 }));
  const [view,setView] = useState('family'), [query,setQuery] = useState(''), [modal,setModal] = useState(() => getSavedFilesList().length === 0 ? 'upload' : null), [mobileMenu,setMobileMenu] = useState(false), [parentFamily,setParentFamily] = useState(''), [toast,setToast] = useState(''), [installPrompt,setInstallPrompt] = useState(null);
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

  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current) return;
    const link = getUrlDeepLink();
    if (!link.id && !link.q) return;
    const pid = findPersonIdFromDeepLink(bundle.data, link);
    if (!pid) return;
    deepLinkApplied.current = true;
    setHistory({ ids: [pid], cursor: 0 });
    setView('family');
    setModal(null);
    setParentFamily('');
    const name = bundle.data.people[pid]?.name;
    if (name) setToast(`מציגים את ${name}`);
  }, [bundle]);

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
    if (next.isDemo) {
      setActiveFileIdInStorage(null);
      result.id = 'demo';
    } else if (next.remembered) {
      const savedItem = saveFileToLocalStorage(next);
      pushToBaobabShared(next);
      if (savedItem) {
        result.id = savedItem.id;
        result.remembered = true;
      } else {
        result.remembered = false;
        setToast('הקובץ נפתח, אך לא ניתן לשמור אותו בדפדפן (זיכרון מלא). הוא זמין למפגש הנוכחי.');
      }
    } else if (result.id) {
      setActiveFileIdInStorage(result.id);
    }
    setBundle(result); setHistory({ ids:[result.isDemo ? DEMO_ROOT : result.data.order[0]], cursor:0 }); setQuery(''); setParentFamily(''); setView('family'); setModal(null); setMobileMenu(false); window.scrollTo({top:0,behavior:'instant'});
    if (result.data.warnings.length) setToast(`האילן נפתח עם ${number(result.data.warnings.length)} הערות. אפשר לעיין בהן בפרטי הקובץ.`);
    else if (!(next.remembered && !result.remembered)) if (!result.isDemo) pushToBaobabShared(result);
    setToast(result.isDemo ? 'נעים להכיר את משפחת לוין. כל הפרטים בדויים.' : `ברוכים הבאים! ${number(result.data.stats.people)} אנשים מחכים לכם באילן.`);
  };

  const loadSavedFile = (fileItem) => {
    const parsedData = parseGedcom(fileItem.raw);
    loadBundle({
      id: fileItem.id,
      filename: fileItem.filename,
      raw: fileItem.raw,
      data: parsedData,
      encoding: fileItem.encoding || 'utf-8',
      encodingInfo: fileItem.encodingInfo,
      importedAt: fileItem.importedAt,
      isDemo: false,
      remembered: true
    });
  };
  const downloadGedcom = () => {
    let raw = bundle.raw;
    if (/^1 CHAR .*$/m.test(raw)) raw = raw.replace(/^1 CHAR .*$/m,'1 CHAR UTF-8');
    else if (/^0 HEAD\s*$/m.test(raw)) raw = raw.replace(/^0 HEAD\s*$/m,'0 HEAD\n1 CHAR UTF-8');
    const url = URL.createObjectURL(new Blob([raw],{type:'text/plain;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = bundle.filename.replace(/\.(gedcom|txt)$/i,'.ged'); if (!/\.ged$/i.test(a.download)) a.download += '.ged'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  };
  const forget = (fileIdToForget) => {
    try {
      const targetId = fileIdToForget || bundle.id;
      if (targetId && targetId !== 'demo') {
        const remaining = removeFileFromLocalStorage(targetId);
        if (bundle.id === targetId) {
          if (remaining.length > 0) {
            const nextFile = remaining[0];
            loadBundle({
              id: nextFile.id,
              filename: nextFile.filename,
              raw: nextFile.raw,
              data: parseGedcom(nextFile.raw),
              encoding: nextFile.encoding || 'utf-8',
              encodingInfo: nextFile.encodingInfo,
              importedAt: nextFile.importedAt,
              isDemo: false,
              remembered: true
            });
          } else {
            loadBundle(demoBundle());
          }
        }
        setToast('הקובץ השמור נמחק מהמכשיר.');
      } else {
        setBundle(b => ({...b, remembered: false}));
        setToast('העותק השמור נמחק מהמכשיר. האילן פתוח עד סגירת העמוד.');
      }
    } catch { setToast('לא ניתן לגשת לאחסון הדפדפן.'); }
  };
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
    try {
      if (bundle.id && bundle.id !== 'demo') {
        removeFileFromLocalStorage(bundle.id);
      }
    } catch {}
    const demo=demoBundle();setBundle(demo);setHistory({ids:[DEMO_ROOT],cursor:0});setView('family');setQuery('');setParentFamily('');setModal(null);setMobileMenu(false);
  };
  const navItems = [{id:'family',icon:Network},{id:'people',icon:UsersRound},{id:'file',icon:FileText}];
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">דילוג לתוכן</a>
      {mobileMenu && <div className="sidebar-backdrop" onClick={() => setMobileMenu(false)}/>}
      <aside ref={menuRef} id="main-sidebar" className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`} aria-label="תפריט ראשי">
        <div className="sidebar-top">
          <button className="brand-button" onClick={() => changeView('family')} aria-label="ענפים — חזרה למבט המשפחתי"><Brand/></button>
          <button className="icon-button sidebar-close" onClick={() => setMobileMenu(false)} aria-label="סגירת תפריט"><X size={20}/></button>
        </div>
        <button className="button button-primary sidebar-upload" onClick={() => { setMobileMenu(false); setModal('upload'); }}>
          <Upload size={18}/><span>פתיחת קובץ GEDCOM</span><span className="upload-plus">+</span>
        </button>
        <div className="nav-label">הסיפור המשפחתי</div>
        <nav className="main-nav">
          {navItems.map(({id,icon:Icon}) => (
            <button className={`nav-item ${view === id ? 'active' : ''}`} key={id} onClick={() => changeView(id)} aria-current={view === id ? 'page' : undefined}>
              <Icon size={19}/><span>{viewNames[id]}</span>
              {id === 'people' ? <span className="nav-count">{number(bundle.data.stats.people)}</span> : view === id ? <span className="active-nav-dot"/> : null}
            </button>
          ))}
          <SidebarToolsMenu bundle={bundle} onDownload={downloadGedcom} onToast={setToast} closeMobileMenu={() => setMobileMenu(false)} />
        </nav>
        <div className="sidebar-separator"/>
        <button className="nav-item subtle-nav" onClick={() => { setMobileMenu(false); setModal('help'); }}>
          <HelpCircle size={19}/><span>נעים להכיר את ענפים</span><ArrowUpLeft size={14}/>
        </button>
        <div className="sidebar-spacer"/>
        <section className="fx-recents" aria-label="אנשים שביקרתם באילן">
          <div className="fx-recents-heading"><Clock3 size={13}/><span>לאחרונה באילן</span></div>
          {[...new Set(history.ids.slice(0,history.cursor+1).reverse())].slice(0,3).map(id=>bundle.data.people[id]).filter(Boolean).map(p=>(
            <button key={p.id} className="fx-visited-person" onClick={()=>selectPerson(p.id)}>
              <Avatar person={p} size="sm"/>
              <span><strong dir="auto">{p.name}</strong><small>{lifeLabel(p)}</small></span>
              {p.id === person.id ? <i className="fx-visited-dot"/> : <ChevronLeft size={12}/>}
            </button>
          ))}
        </section>
        <div className="sidebar-file" onClick={() => changeView('file')} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); changeView('file'); } }}>
          <span className="sidebar-file-icon"><FileText size={21}/></span>
          <div><strong title={demoSurname}>{demoSurname}</strong><span>{bundle.isDemo ? 'אילן לדוגמה' : 'הקובץ שלכם'}<i/> {number(bundle.data.stats.generations)} דורות</span></div>
          <ChevronLeft size={15}/>
        </div>
        <div className="sidebar-privacy"><ShieldCheck size={14}/><span>המשפחה שלכם. לעיניים שלכם.</span></div>
        <div className="sidebar-cloud sidebar-cloud-secondary">
          <CloudAccess Dialog={Dialog} bundle={bundle} selectedId={person.id} onApplySnapshot={applyCloudSnapshot} onClear={clearCloudView} onUpload={()=>setModal('upload')} isModalOpen={!!modal||mobileMenu}/>
        </div>
      </aside>
      <main className="main-content" id="main-content">
        <header className="topbar">
          <div className="desktop-breadcrumb"><span>סביבת העבודה</span><ChevronLeft size={14}/><strong>{viewNames[view]}</strong></div>
          <div className="mobile-brand">
            <button className="icon-button" onClick={() => setMobileMenu(true)} aria-expanded={mobileMenu} aria-controls="main-sidebar" aria-label="פתיחת תפריט"><Menu size={22}/></button>
            <Brand compact/>
          </div>
          <div className="topbar-left">
            <button className={`demo-badge ${!bundle.isDemo ? 'real-data-badge' : ''}`} onClick={() => changeView('file')}>
              <span/>{bundle.isDemo ? 'מציגים משפחה לדוגמה' : bundle.remembered ? 'נשמר במכשיר הזה' : 'הקובץ שלכם, באופן פרטי'}<ChevronDown size={12}/>
            </button>
            <span className="topbar-divider"/>
            <button className="icon-button help-top" onClick={() => setModal('help')} aria-label="עזרה והסבר"><HelpCircle size={20}/></button>
          </div>
        </header>
        <div className="page-content">
          <section className="page-intro">
            <div>
              <div className="intro-eyebrow"><span className="eyebrow-line"/>{view === 'family' ? 'שורשים. אנשים. סיפורים.' : view === 'people' ? 'הסיפור הוא האנשים' : 'מקום אחד לכל הענפים'}</div>
              <h1>{view === 'family' ? <>המשפחה שלכם, <em>בתמונה אחת.</em></> : view === 'people' ? <>פנים רבות. <em>משפחה אחת.</em></> : <>כל סיפור <em>מתחיל בחיבור.</em></>}</h1>
              <p>{view === 'family' ? 'אנשים, מקומות וזיכרונות — הסיפור המשפחתי במבט קרוב.' : view === 'people' ? 'חפשו שם מוכר, או גלו סיפור שעוד לא הכרתם.' : 'כל המידע על האילן שלכם, והדרך שבה אנחנו שומרים עליו.'}</p>
            </div>
            <div className="intro-stats" aria-label="נתוני האילן">
              {[[bundle.data.stats.people,'אנשים'],[bundle.data.stats.families,'משפחות'],[bundle.data.stats.generations,'דורות']].map(([n,label]) => (
                <div key={label}><strong>{number(n)}</strong><span>{label}</span></div>
              ))}
            </div>
          </section>
          {view !== 'file' && <SearchBar data={bundle.data} query={query} setQuery={setQuery} onSelect={selectPerson} onDirectory={() => changeView('people')}/>}
          {view === 'family' && (
            <div className="focus-breadcrumb">
              <button className="text-button" onClick={resetSelection} aria-label="חזרה לאדם הראשון באילן"><Home size={14}/><span>{demoSurname}</span></button>
              <ChevronLeft size={12}/><span>{person.name}</span>
              {!bundle.isDemo && <span className="source-file-label"><ShieldCheck size={12}/>GEDCOM · פענוח מקומי</span>}
            </div>
          )}
          {view === 'family' ? (
            <FamilyView data={bundle.data} person={person} bundle={bundle} onSelect={selectPerson} parentFamily={parentFamily} setParentFamily={setParentFamily} history={history} onHistory={goHistory} onHelp={() => setModal('help')}/>
          ) : view === 'people' ? (
            <PeopleView data={bundle.data} query={query} setQuery={setQuery} onSelect={selectPerson}/>
          ) : (
            <FileView bundle={bundle} onUpload={() => setModal('upload')} onDownload={downloadGedcom} onDemo={() => loadBundle(demoBundle())} onForget={forget} onLoadSaved={loadSavedFile} onToast={setToast}/>
          )}
          <footer className="workspace-footer">
            <span><Sprout size={15}/>לכל משפחה יש דרך. לכל אדם יש מקום.</span>
            <span><ShieldCheck size={13}/>פענוח הנתונים מתבצע במכשיר שלכם</span>
          </footer>
        </div>
      </main>
      <nav className="mobile-bottom-nav" aria-label="ניווט מהיר">
        <button className={view === 'family' ? 'selected' : ''} onClick={() => changeView('family')}><Network size={21}/><span>המשפחה</span></button>
        <button className={view === 'people' ? 'selected' : ''} onClick={() => changeView('people')}><UsersRound size={21}/><span>כל האנשים</span></button>
        <button className="mobile-upload" onClick={() => setModal('upload')}><span><Upload size={20}/></span><span>פתיחת קובץ</span></button>
        <button className={view === 'file' ? 'selected' : ''} onClick={() => changeView('file')}><FileText size={21}/><span>פרטי הקובץ</span></button>
      </nav>
      {modal === 'upload' && <UploadDialog onClose={() => setModal(null)} onImport={loadBundle} onDemo={() => loadBundle(demoBundle())}/>}
      {modal === 'tools' && <ToolsDialog onClose={() => setModal(null)} bundle={bundle} onToast={setToast} />}
      {modal === 'help' && <HelpDialog onClose={() => setModal(null)} onUpload={() => setModal('upload')} onDownload={downloadGedcom} installPrompt={installPrompt} onInstall={handleInstallClick}/>}
      {toast && <div className="toast" role="status"><span className="toast-icon"><Check size={17}/></span><span>{toast}</span><button onClick={() => setToast('')} aria-label="סגירת הודעה"><X size={16}/></button></div>}
      <div className="print-footer">ענפים · {demoSurname} · {new Date().toLocaleDateString('he-IL')} · {bundle.isDemo ? 'נתוני הדגמה בדויים' : 'מידע פרטי מתוך קובץ GEDCOM'}</div>
    </div>
  );
}
