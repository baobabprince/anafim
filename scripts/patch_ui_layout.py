from pathlib import Path
import re

def patch_gedcom():
    path = Path('family-viewer/src/gedcom.js')
    text = path.read_text()
    if 'export function formatDateCentral' in text and 'const hebrew = hebrewDateLabel(d);' not in text.split('export function formatDate')[1].split('export function')[0]:
        print('gedcom already ok')
        return
    old = """export function formatDate(date = '') {
  if (!date) return 'לא צוין';
  let d = date.trim();
  const hebrew = hebrewDateLabel(d);
  d = d.replace(/^ABT\\s+/i,'בערך ב־').replace(/^CAL\\s+/i,'מחושב: ').replace(/^EST\\s+/i,'משוער: ').replace(/^BEF\\s+/i,'לפני ').replace(/^AFT\\s+/i,'אחרי ').replace(/^BET\\s+/i,'בין ').replace(/\\s+AND\\s+/i,' ל־').replace(/^FROM\\s+/i,'מ־').replace(/\\s+TO\\s+/i,' עד ');
  d = d.replace(/\\b(\\d{1,2})\\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\\s+(\\d{3,4})\\b/gi, (_, day, mon, year) => `${Number(day)} ב${months[mon.toUpperCase()]} ${year}`);
  d = d.replace(/\\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\\b/gi, m => months[m.toUpperCase()]);
  if (hebrew) return `${d} · ${hebrew}`;
  return d;
}"""
    new = """export function formatDate(date = '') {
  if (!date) return 'לא צוין';
  let d = date.trim();
  d = d.replace(/^ABT\\s+/i,'בערך ב־').replace(/^CAL\\s+/i,'מחושב: ').replace(/^EST\\s+/i,'משוער: ').replace(/^BEF\\s+/i,'לפני ').replace(/^AFT\\s+/i,'אחרי ').replace(/^BET\\s+/i,'בין ').replace(/\\s+AND\\s+/i,' ל־').replace(/^FROM\\s+/i,'מ־').replace(/\\s+TO\\s+/i,' עד ');
  d = d.replace(/\\b(\\d{1,2})\\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\\s+(\\d{3,4})\\b/gi, (_, day, mon, year) => `${Number(day)} ב${months[mon.toUpperCase()]} ${year}`);
  d = d.replace(/\\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\\b/gi, m => months[m.toUpperCase()]);
  return d;
}

/** Gregorian + Hebrew — only for the central person display. */
export function formatDateCentral(date = '') {
  if (!date) return 'לא צוין';
  const gregorian = formatDate(date);
  const hebrew = hebrewDateLabel(date);
  if (hebrew && hebrew !== gregorian) return `${gregorian} · ${hebrew}`;
  return gregorian;
}"""
    if old not in text:
        if 'formatDateCentral' in text:
            print('gedcom already has formatDateCentral')
            return
        raise SystemExit('formatDate block with hebrew not found')
    path.write_text(text.replace(old, new, 1))
    print('gedcom ok')

def patch_fx():
    path = Path('family-viewer/src/FamilyExperience.jsx')
    t = path.read_text()
    t = t.replace(
        "import { formatDate, getRelations, getYear, initials, lifeLabel, pedigreeLabel } from './gedcom.js';",
        "import { formatDate, formatDateCentral, getRelations, getYear, initials, lifeLabel, pedigreeLabel } from './gedcom.js';",
    )
    t = t.replace(
        '<div className="fx-focus-ribbon"><span><span className="fx-selection-dot"/>במרכז הסיפור</span>',
        '<div className="fx-focus-ribbon"><span className="fx-focus-ribbon-mark" aria-hidden="true"><span className="fx-selection-dot"/></span>',
    )
    t = t.replace(
        "event?.date ? formatDate(event.date) : event?.detail || (event ? 'התאריך לא צוין' : fallback || 'לא תועד')",
        "event?.date ? formatDateCentral(event.date) : event?.detail || (event ? 'התאריך לא צוין' : fallback || 'לא תועד')",
    )
    if 'fx-relative-scroll-section' not in t:
        start = t.find('function RelativeSection')
        end = t.find('\nfunction FactRow')
        if start < 0 or end < 0:
            raise SystemExit('RelativeSection not found')
        new_rel = '''function RelativeSection({ title, icon:Icon, people, type, onSelect }) {
  const relationship = p => type === 'children' ? (p.otherParent ? `עם ${p.otherParent}` : 'ילד/ה כפי שתועד') : type === 'siblings' ? (p.half ? 'אח/ות למחצה' : p.sex === 'F' ? 'אחות' : p.sex === 'M' ? 'אח' : 'אח/ות') : p.family?.divorce ? 'קשר קודם' : p.family?.marriage?.date ? `נישואים · ${formatDate(p.family.marriage.date)}` : 'בן / בת זוג';
  return <section className="relative-section fx-relative-section fx-relative-scroll-section" id={`relatives-${type}`}>
    <div className="fx-relative-title-row"><span className={`fx-relative-symbol fx-symbol-${type}`}><Icon size={15}/></span><strong>{title}</strong><span className="fx-count">{count(people.length)}</span></div>
    {people.length ? <div className="fx-relative-scroll" role="list" aria-label={title}>{people.map(p => <button type="button" className="fx-relative-scroll-item" role="listitem" key={p.id} onClick={() => onSelect(p.id)} aria-label={`מעבר אל ${p.name}`}><Portrait person={p} size="small"/><strong dir="auto">{p.given || p.name}</strong><small>{relationship(p)}</small><span className="fx-scroll-years"><bdi>{lifeLabel(p)}</bdi></span></button>)}</div> : <span className="fx-missing-relation">לא תועדו בקובץ</span>}
  </section>;
}
'''
        t = t[:start] + new_rel + t[end:]
    t = t.replace(
        "const [showGrandparents,setShowGrandparents] = useState(preferGrandparentsOpen),[groups,setGroups] = useState(new Set()),[tab,setTab] = useState('overview'),[grandparentFamilies,setGrandparentFamilies] = useState({});\n  useEffect(()=>{setGroups(new Set());setTab('overview');setShowGrandparents(preferGrandparentsOpen());setGrandparentFamilies({});},[person.id,data]);",
        "const [showGrandparents,setShowGrandparents] = useState(preferGrandparentsOpen),[tab,setTab] = useState('overview'),[grandparentFamilies,setGrandparentFamilies] = useState({});\n  useEffect(()=>{setTab('overview');setShowGrandparents(preferGrandparentsOpen());setGrandparentFamilies({});},[person.id,data]);",
    )
    t = t.replace(
        "const toggleGroup = type => setGroups(current=>{const next=new Set(current);if(next.has(type))next.delete(type);else next.add(type);return next;});\n  const scrollBehavior = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';\n  const openGroup = type => {setGroups(current=>new Set([...current,type]));requestAnimationFrame(()=>document.getElementById(`relatives-${type}`)?.scrollIntoView({behavior:scrollBehavior(),block:'nearest'}));};",
        "const scrollBehavior = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';\n  const openGroup = type => {requestAnimationFrame(()=>document.getElementById(`relatives-${type}`)?.scrollIntoView({behavior:scrollBehavior(),block:'nearest'}));};",
    )
    t = re.sub(
        r'<RelativeSection title="([^"]+)" icon=\{(\w+)\} people=\{([^}]+)\} type="([^"]+)" onSelect=\{onSelect\} open=\{groups\.has\(\'([^\']+)\'\)\} onToggle=\{\(\)=>toggleGroup\(\'([^\']+)\'\)\} resetKey=\{person\.id\}/>',
        r'<RelativeSection title="\1" icon={\2} people={\3} type="\4" onSelect={onSelect}/>',
        t,
    )
    t = t.replace(
        '<span className="fx-compact-hint">קומפקטי. קרוב. נפתח בלחיצה.</span>',
        '<span className="fx-compact-hint">הזזה ימינה ושמאלה לכל הרשימה</span>',
    )
    path.write_text(t)
    print('FamilyExperience ok')

def patch_app():
    path = Path('family-viewer/src/App.jsx')
    a = path.read_text()
    a = a.replace(
        '<CloudAccess Dialog={Dialog} bundle={bundle} selectedId={person.id} onApplySnapshot={applyCloudSnapshot} onClear={clearCloudView} onUpload={()=>setModal(\'upload\')} isModalOpen={!!modal||mobileMenu}/><SearchBar',
        '<SearchBar',
    )
    if 'sidebar-cloud' not in a:
        cloud_jsx = '<div className="sidebar-cloud"><CloudAccess Dialog={Dialog} bundle={bundle} selectedId={person.id} onApplySnapshot={applyCloudSnapshot} onClear={clearCloudView} onUpload={()=>setModal(\'upload\')} isModalOpen={!!modal||mobileMenu}/></div>'
        a = a.replace('<div className="sidebar-privacy">', cloud_jsx + '<div className="sidebar-privacy">', 1)
    path.write_text(a)
    print('App ok')

def patch_css():
    css = Path('family-viewer/src/family.css')
    c = css.read_text()
    if 'fx-relative-scroll' not in c:
        c += """
.fx-relative-scroll-section{margin-bottom:10px}
.fx-relative-title-row{display:flex;align-items:center;gap:7px;margin-bottom:6px;padding-inline:2px}
.fx-relative-title-row strong{font-size:12px;font-weight:600;color:#4a5a3e}
.fx-relative-scroll{display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory;padding:4px 2px 10px;scrollbar-width:thin}
.fx-relative-scroll::-webkit-scrollbar{height:4px}
.fx-relative-scroll::-webkit-scrollbar-thumb{background:#c5b8a0;border-radius:4px}
.fx-relative-scroll-item{flex:0 0 auto;scroll-snap-align:start;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:96px;max-width:120px;padding:8px 8px 10px;border-radius:12px;border:1px solid #e4e0d4;background:#fffcf7;text-align:center;color:inherit}
.fx-relative-scroll-item:hover{border-color:#c4a882;background:#fff8ee}
.fx-relative-scroll-item strong{font-size:11px;line-height:1.35;font-weight:600;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fx-relative-scroll-item small{font-size:9px;color:#7a6b55;line-height:1.3;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fx-scroll-years{font-size:8px;color:#8a7b64;line-height:1.3}
.fx-focus-ribbon-mark{display:flex;align-items:center;min-height:14px}
"""
        css.write_text(c)
    styles = Path('family-viewer/src/styles.css')
    s = styles.read_text()
    if 'sidebar-cloud' not in s:
        s += """
.sidebar-cloud{padding:8px 12px 12px;border-top:1px solid var(--line)}
.sidebar-cloud .cloud-strip{flex-direction:column;align-items:stretch;gap:8px;padding:10px;margin:0;border-radius:12px;background:#f4f1ea;border:1px solid #e2ddd2}
.sidebar-cloud .cloud-strip>div{min-width:0}
.sidebar-cloud .cloud-entry{width:100%;justify-content:center}
.page-content>.cloud-strip{display:none!important}
"""
        styles.write_text(s)
    print('css ok')

if __name__ == '__main__':
    patch_gedcom()
    patch_fx()
    patch_app()
    patch_css()
