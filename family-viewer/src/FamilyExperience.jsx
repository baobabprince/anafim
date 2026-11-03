import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, ArrowUpLeft, Baby, BookOpen, BriefcaseBusiness,
  CalendarDays, Check, ChevronDown, ChevronLeft, Clock3, FileText, Flower2,
  GitBranch, Heart, House, Info, Layers3, MapPin, Network,
  Printer, Quote, ShieldCheck, Sparkles, Sprout, UserRound, UsersRound,
} from 'lucide-react';
import { formatDate, formatDateCentral, getRelations, getYear, initials, lifeLabel, pedigreeLabel } from './gedcom.js';
import { ATTRIBUTE_NAMES, branchPeople, eventTitle, personInformation, personRecord } from './person-info.js';
import { t, getLang } from './i18n/index.js';

const count = n => n.toLocaleString(getLang() === 'en' ? 'en-US' : 'he-IL');
const shortId = id => id.replaceAll('@','');
const parentRole = person => person.sex === 'F' ? t('fx.mother') : person.sex === 'M' ? t('fx.father') : t('fx.parent');
const birthLabel = person => person.sex === 'F' ? t('fx.bornF') : person.sex === 'M' ? t('fx.bornM') : t('fx.birth');
const deathLabel = person => person.sex === 'F' ? t('fx.diedF') : person.sex === 'M' ? t('fx.diedM') : t('fx.death');

function GenderIcon({sex}) {
  if (!['F','M'].includes(sex)) return <UserRound size={11}/>;
  return <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">{sex === 'F' ? <><circle cx="6" cy="4" r="2.5"/><path d="M6 6.5V11M4 9h4"/></> : <><circle cx="4.5" cy="7.5" r="2.7"/><path d="m6.5 5.5 4-4M7.5 1.5h3v3"/></>}</svg>;
}
function Portrait({ person, size = 'normal' }) {
  return <span className={`fx-portrait fx-portrait-${size} fx-${person.sex === 'F' ? 'rose' : person.sex === 'M' ? 'sage' : 'neutral'}`} aria-hidden="true">
    <span className="fx-monogram">{initials(person)}</span>
    <span className="fx-gender"><GenderIcon sex={person.sex}/></span>
  </span>;
}

function PersonChip({ person, onSelect, year = true }) {
  const birth = getYear(person.birth?.date), death = getYear(person.death?.date);
  return <button className={`fx-person-chip fx-chip-${person.sex === 'F' ? 'rose' : 'sage'}`} onClick={() => onSelect(person.id)} aria-label={t('fx.goTo', { name: person.name })}>
    <span className="fx-chip-dot"/>
    <span dir="auto">{person.given || person.name}</span>
    {year && birth && <bdi className="fx-chip-year">{birth}{death ? `–${death}` : ''}</bdi>}
    <ArrowUpLeft size={11}/>
  </button>;
}

function LifeLine({ icon:Icon, label, date, place }) {
  return <span className="fx-life-line"><Icon size={12}/><span><span className="fx-life-label">{label}</span><bdi>{date ? formatDate(date) : t('fx.dateUnknown')}</bdi>{place && <small dir="auto">{place}</small>}</span></span>;
}

function ParentCard({ person, onSelect, detailed = true }) {
  return <button className={`parent-card fx-parent fx-parent-${person.sex === 'F' ? 'rose' : 'sage'}`} onClick={() => onSelect(person.id)} aria-label={t('fx.goToFamily', { name: person.name })}>
    <span className="fx-parent-top"><span className="fx-role-label">{parentRole(person)}</span><ArrowUpLeft size={14}/></span>
    <span className="fx-parent-identity"><Portrait person={person}/><strong dir="auto">{person.name}</strong></span>
    <span className="fx-parent-lifespan"><CalendarDays size={11}/><span>{lifeLabel(person)}</span></span>
    {detailed && <span className="fx-parent-facts"><LifeLine icon={Sprout} label={birthLabel(person)} date={person.birth?.date} place={person.birth?.place}/>{person.death && <LifeLine icon={Flower2} label={deathLabel(person)} date={person.death.date} place={person.death.place}/>}</span>}
    {person.occupation && detailed && <span className="fx-parent-occupation"><BriefcaseBusiness size={11}/><span dir="auto">{person.occupation}</span></span>}
    <span className="fx-parent-footer">לגלות את הסיפור<ChevronLeft size={12}/></span>
  </button>;
}

const grandparentSide = parent => parent.sex === 'M' ? t('fx.fatherSide') : parent.sex === 'F' ? t('fx.motherSide') : t('fx.parentSide');
const grandparentRole = person => person.sex === 'F' ? t('fx.grandmother') : person.sex === 'M' ? t('fx.grandfather') : t('fx.grandparent');

function GrandparentCard({ person, onSelect }) {
  return <button className={`fx-grandparent-card fx-grandparent-${person.sex === 'F' ? 'rose' : person.sex === 'M' ? 'sage' : 'neutral'}`} onClick={() => onSelect(person.id)} aria-label={t('fx.goTo', { name: person.name })} title={`פתיחת המבט המשפחתי של ${person.name}`}>
    <span className="fx-grandparent-top"><span className="fx-grandparent-role">{grandparentRole(person)}</span><ArrowUpLeft size={12}/></span>
    <span className="fx-grandparent-identity"><Portrait person={person} size="small"/><strong dir="auto">{person.name}</strong></span>
    <span className="fx-grandparent-years"><CalendarDays size={11}/><bdi>{lifeLabel(person)}</bdi></span>
    {person.birth?.place && <span className="fx-grandparent-place"><MapPin size={11}/><bdi>{person.birth.place}</bdi></span>}
  </button>;
}

function GrandparentsGeneration({ branches, open, onSelect, onFamilyChange }) {
  return <section id="grandparents-generation" className={`fx-grandparents fx-grandparents-clear ${branches.length === 1 ? 'fx-single-parent' : ''}`} hidden={!open} aria-label="דור הסבים והסבתות">
    {branches.map(({ parent, people, parentFamilies, activeParentFamily }) => <section data-parent-id={parent.id} className={`fx-grandparent-side fx-side-${parent.sex === 'F' ? 'maternal' : parent.sex === 'M' ? 'paternal' : 'parent'}`} key={parent.id} aria-label={`${grandparentSide(parent)} — ${parent.name}`}>
      <header className="fx-grandparent-side-heading"><span className="fx-side-icon"><GitBranch size={14}/></span><div><h4>{grandparentSide(parent)}</h4><p>ההורים של <strong dir="auto">{parent.name}</strong></p></div></header>
      {parentFamilies.length > 1 ? <select className="fx-grandparent-family" aria-label={`בחירת משפחת סבים של ${parent.name}`} value={activeParentFamily || ''} onChange={event => onFamilyChange(parent.id, event.target.value)}>{parentFamilies.map((family, index) => <option key={family.id} value={family.id}>{pedigreeLabel(family.type)}{index ? ` ${index + 1}` : ''}</option>)}</select> : parentFamilies[0]?.type && parentFamilies[0].type.toLowerCase() !== 'birth' ? <span className="fx-grandparent-pedigree">{pedigreeLabel(parentFamilies[0].type)}</span> : null}
      <div className="fx-grandparent-members">{people.map(person => <GrandparentCard key={person.id} person={person} onSelect={onSelect}/>)}{people.length < 2 && <div className={`fx-grandparent-missing ${!people.length ? 'fx-no-grandparents' : ''}`}><UserRound size={21}/><strong>{people.length ? t('fx.grandparentInfoMissing') : t('fx.grandparentsMissing')}</strong><span>אין פרטים נוספים בקובץ</span></div>}</div>
      <div className="fx-grandparent-stem" aria-hidden="true"><span/></div>
    </section>)}
    {branches.length > 1 && <span className="fx-parent-level-label" aria-hidden="true">דור ההורים</span>}
  </section>;
}

function FocusFact({ icon:Icon, label, event, fallback }) {
  return <div className="fx-focus-fact"><span className="fx-focus-fact-icon"><Icon size={15}/></span><span><span className="fx-fact-label">{label}</span><strong dir="auto">{event?.date ? formatDateCentral(event.date) : event?.detail || (event ? 'התאריך לא צוין' : fallback || t('fx.notRecorded'))}</strong>{event?.place && <small><MapPin size={10}/><bdi>{event.place}</bdi></small>}</span></div>;
}


function focusIdentity(person, relations) {
  const given = (person.given || person.name?.split(/\s+/)[0] || '').trim();
  const hasMarriage = Boolean(relations?.partners?.length || (person.spouseFamilies || []).length);
  let marriedSurname = (person.marriedSurname || '').trim();
  if (!marriedSurname && person.sex === 'F' && hasMarriage) {
    const partnerSurnames = [...new Set((relations?.partners || []).map(p => (p.surname || '').trim()).filter(Boolean))];
    if (partnerSurnames.length === 1) marriedSurname = partnerSurnames[0];
    else if (person.surname && person.birthSurname && person.surname !== person.birthSurname) marriedSurname = person.surname;
  }
  const birthSurname = (person.birthSurname || '').trim();
  const showMarried = person.sex === 'F' && hasMarriage && marriedSurname;
  const title = showMarried ? [given, marriedSurname].filter(Boolean).join(' ') : person.name;
  const maiden = showMarried && birthSurname && birthSurname !== marriedSurname ? birthSurname : '';
  return { title, given, marriedSurname: showMarried ? marriedSurname : '', maiden };
}

function FocusCard({ person, info, relations, onOpenGroup, onSources }) {
  const marriage = info.events.find(e => e.type === 'MARR');
  const secondEvent = person.death || marriage || info.residence;
  const secondLabel = person.death ? 'פטירה' : marriage ? t('fx.marriage') : t('fx.residence');
  const SecondIcon = person.death ? Flower2 : marriage ? Heart : House;
  const identity = focusIdentity(person, relations);
  return <article className="focus-card fx-focus" key={person.id}>
    <div className="fx-focus-ribbon"><span className="fx-focus-ribbon-mark" aria-hidden="true"><span className="fx-selection-dot"/></span><button onClick={onSources} title="פרטי הרשומה והמקורות" aria-label="הצגת מקורות ופרטי הרשומה"><FileText size={12}/><bdi>{shortId(person.id)}</bdi></button></div>
    <div className="fx-focus-identity"><Portrait person={person} size="large"/><div><span className="fx-profile-type">{person.sex === 'F' ? t('fx.storyF') : person.sex === 'M' ? t('fx.storyM') : t('fx.storyPersonal')}</span><h2 dir="auto">{identity.marriedSurname ? <>{identity.given} <span className="fx-focus-married-surname">{identity.marriedSurname}</span></> : identity.title}</h2>{identity.maiden ? <span className="fx-focus-maiden">לבית {identity.maiden}</span> : null}<span className="fx-focus-years">{lifeLabel(person)}{info.ageAtDeath !== null && <span> · {info.ageAtDeath} שנים</span>}</span></div><Sprout className="fx-focus-sprout" size={30} strokeWidth={1.2}/></div>
    <div className="fx-focus-facts"><FocusFact icon={Sprout} label="לידה" event={person.birth}/><FocusFact icon={SecondIcon} label={secondLabel} event={secondEvent}/></div>
    {person.occupation && <div className="fx-focus-occupation"><BriefcaseBusiness size={13}/><span dir="auto">{person.occupation}</span></div>}
    <div className="fx-focus-summary"><button onClick={() => onOpenGroup('partners')}><Heart size={12}/>{count(relations.partners.length)} בני זוג</button><button onClick={() => onOpenGroup('children')}><Baby size={12}/>{count(relations.children.length)} ילדים</button><button onClick={() => onOpenGroup('siblings')}><UsersRound size={12}/>{count(relations.siblings.length)} אחים</button></div>
  </article>;
}

function RelativeSection({ title, icon:Icon, people, type, onSelect }) {
  const relationship = p => type === 'children' ? (p.otherParent ? `עם ${p.otherParent}` : 'ילד/ה כפי שתועד') : type === 'siblings' ? (p.half ? t('fx.halfSibling') : p.sex === 'F' ? t('fx.sister') : p.sex === 'M' ? t('fx.brother') : t('fx.sibling')) : p.family?.divorce ? t('fx.previousBond') : p.family?.marriage?.date ? `נישואים · ${formatDate(p.family.marriage.date)}` : t('fx.spouse');
  return <section className="relative-section fx-relative-section fx-relative-scroll-section" id={`relatives-${type}`}>
    <div className="fx-relative-title-row"><span className={`fx-relative-symbol fx-symbol-${type}`}><Icon size={15}/></span><strong>{title}</strong><span className="fx-count">{count(people.length)}</span></div>
    {people.length ? <div className="fx-relative-scroll" role="list" aria-label={title}>{people.map(p => <button type="button" className="fx-relative-scroll-item" role="listitem" key={p.id} onClick={() => onSelect(p.id)} aria-label={t('fx.goTo', { name: p.name })}><Portrait person={p} size="small"/><strong dir="auto">{p.given || p.name}</strong><small>{relationship(p)}</small><span className="fx-scroll-years"><bdi>{lifeLabel(p)}</bdi></span></button>)}</div> : <span className="fx-missing-relation">לא תועדו בקובץ</span>}
  </section>;
}

function FactRow({ icon:Icon, label, children }) {
  return <div className="fx-fact-row"><Icon size={14}/><dl><dt>{label}</dt><dd>{children}</dd></dl></div>;
}

function OverviewPanel({ person, info }) {
  const [allNotes,setAllNotes] = useState(false);
  useEffect(()=>setAllNotes(false),[person.id]);
  return <div className="fx-overview-panel"><div className="fx-overview-facts"><FactRow icon={CalendarDays} label="לידה"><strong>{person.birth?.date ? formatDate(person.birth.date) : t('fx.dateUnknown')}</strong>{person.birth?.place && <span dir="auto">{person.birth.place}</span>}</FactRow>{person.death && <FactRow icon={Flower2} label="פטירה"><strong>{person.death.date ? formatDate(person.death.date) : 'התאריך לא צוין'}</strong>{person.death.place && <span dir="auto">{person.death.place}</span>}{person.death.cause && <span dir="auto">{person.death.cause}</span>}</FactRow>}{person.occupation && <FactRow icon={BriefcaseBusiness} label="עיסוק"><strong dir="auto">{person.occupation}</strong></FactRow>}{info.residence && <FactRow icon={House} label="מגורים כפי שתועדו"><strong dir="auto">{info.residence.place || info.residence.detail}</strong>{info.residence.date && <span>{formatDate(info.residence.date)}</span>}</FactRow>}{!!person.alternateNames.length && <FactRow icon={UserRound} label="שמות נוספים">{person.alternateNames.map((name,i)=><strong key={i} dir="auto">{name}</strong>)}</FactRow>}{(person.attributes || []).filter(a=>a.value).map((attribute,i)=><FactRow key={i} icon={Info} label={ATTRIBUTE_NAMES[attribute.type] || attribute.type}><strong dir="auto">{attribute.value}</strong></FactRow>)}</div>
    {!!info.notes.length && <div className={`fx-notes ${allNotes ? 'fx-notes-open' : ''}`}><div className="fx-section-label"><Quote size={14}/><h4>{t('fx.personalWords')}</h4><span>{count(info.notes.length)}</span></div>{(allNotes ? info.notes : info.notes.slice(0,1)).map((note,i)=><div className="fx-note" key={i}>{note.context !== t('fx.personalNote') && <small>{note.context}</small>}<p dir="auto">{note.text}</p></div>)}{(info.notes.length > 1 || info.notes[0]?.text.length > 220) && <button className="fx-text-link" onClick={()=>setAllNotes(v=>!v)} aria-expanded={allNotes}>{allNotes ? t('fx.lessStory') : t('fx.readFull')}<ChevronLeft size={13}/></button>}</div>}
    {info.places.length > 1 && <div className="fx-places"><div className="fx-section-label"><MapPin size={13}/><h4>{t('fx.lifeStations')}</h4></div><div>{info.places.map(place=><span dir="auto" key={place}>{place}</span>)}</div></div>}
  </div>;
}

function TimelinePanel({ info }) {
  return <div className="fx-timeline-panel"><div className="fx-section-intro"><strong>{t('fx.momentsTitle')}</strong><span>{count(info.events.length)} אירועים כפי שתועדו בקובץ</span></div><ol className="fx-life-timeline">{info.events.map((event,i)=>{
    const Icon = event.type === 'BIRT' ? Sprout : event.type === 'MARR' ? Heart : event.type === 'DEAT' ? Flower2 : event.type === 'RESI' ? House : CalendarDays;
    return <li key={i} className={`fx-timeline-item fx-event-${event.type.toLowerCase()}`}><span className="fx-event-icon"><Icon size={13}/></span><div><span className="fx-event-label">{eventTitle(event)}</span><strong>{event.date ? formatDate(event.date) : 'התאריך לא צוין'}</strong>{event.place && <span className="fx-event-place"><MapPin size={11}/><bdi>{event.place}</bdi></span>}{event.type === 'CHIL_BIRT' && event.detail && <span className="fx-event-partner" dir="auto">{event.detail}</span>}{event.partners?.length > 0 && event.type !== 'CHIL_BIRT' && <span className="fx-event-partner">עם {event.partners.map(p=>p.name).join(', ')}</span>}{event.detail && event.type !== 'CHIL_BIRT' && <p dir="auto">{event.detail}</p>}{event.address && <p dir="auto">{event.address}</p>}{event.cause && <p dir="auto">{event.cause}</p>}{event.age && <small>גיל כפי שתועד: {event.age}</small>}{event.notes?.map((note,index)=><p className="fx-event-note" dir="auto" key={index}>{note}</p>)}</div></li>;
  })}</ol>{!info.events.length && <div className="fx-tab-empty"><CalendarDays size={27}/><strong>{t('fx.noEvents')}</strong><p>תאריכים ומקומות יופיעו כאן אם נכללו בקובץ המקורי.</p></div>}</div>;
}

function SourcesPanel({ person, info, bundle }) {
  const [rawOpen,setRawOpen] = useState(false);
  useEffect(()=>setRawOpen(false),[person.id]);
  const raw = useMemo(()=>rawOpen ? personRecord(bundle.raw,person.id) : '',[rawOpen,bundle.raw,person.id]);
  return <div className="fx-sources-panel"><div className="fx-section-intro"><strong>{t('fx.sourcesTitle')}</strong><span>{count(info.sourceCount)} מקורות מקושרים לרשומה</span></div>{info.citations.map((citation,i)=><article className="fx-source-card" key={i}><span className="fx-source-number">{i+1}</span><div><small>{citation.context}</small><h4 dir="auto">{citation.source?.title || citation.id}</h4>{citation.source?.author && <p dir="auto">{citation.source.author}</p>}{citation.source?.publication && <p dir="auto">{citation.source.publication}</p>}{citation.page && <span>מראה מקום: <bdi>{citation.page}</bdi></span>}{citation.text && <blockquote dir="auto">{citation.text}</blockquote>}</div></article>)}{!info.citations.length && <div className="fx-tab-empty"><BookOpen size={27}/><strong>{t('fx.noSources')}</strong><p>המידע מוצג כפי שהגיע מקובץ ה־GEDCOM, ללא השלמות או ניחושים.</p></div>}<div className="fx-origin-box"><FileText size={17}/><div><span>{t('fx.sourceFile')}</span><strong dir="auto">{bundle.filename}</strong><small>{t('fx.recordId')}: <bdi>{shortId(person.id)}</bdi></small></div></div><details className="fx-raw-record" open={rawOpen} onToggle={event=>setRawOpen(event.currentTarget.open)}><summary>הצגת הרשומה המקורית<ChevronDown size={13}/></summary>{rawOpen && <><pre dir="ltr" tabIndex={0} role="region" aria-label={`רשומת GEDCOM של ${person.name}`}>{raw.slice(0,20000) || 'הרשומה המקורית לא נמצאה.'}</pre>{raw.length > 20000 && <small>מוצגים 20,000 התווים הראשונים. הקובץ המקורי נשמר במלואו.</small>}</>}</details></div>;
}

function BranchCard({ data, person, onSelect }) {
  const [expanded,setExpanded] = useState(false),[direction,setDirection] = useState('ancestors'),[limit,setLimit] = useState(16);
  useEffect(()=>{setExpanded(false);setLimit(16);},[person.id]);
  const ancestors = useMemo(()=>branchPeople(data,person.id,'ancestors'),[data,person.id]);
  const descendants = useMemo(()=>branchPeople(data,person.id,'descendants'),[data,person.id]);
  const branch = direction === 'ancestors' ? ancestors : descendants;
  return <section className="fx-branch-card"><header><span className="fx-branch-symbol"><GitBranch size={20}/></span><div><h3>{t('fx.branchOf', { name: person.given || person.name })}</h3><p>עוד חיבורים שעוברים דרך הסיפור הזה</p></div></header><div className="fx-branch-stats"><button onClick={()=>{setDirection('ancestors');setExpanded(true);}}><strong>{count(ancestors.count)}</strong><span>בדורות הקודמים</span></button><span className="fx-branch-divider"/><button onClick={()=>{setDirection('descendants');setExpanded(true);}}><strong>{count(descendants.count)}</strong><span>צאצאים מתועדים</span></button></div><button className="fx-branch-toggle" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded} aria-controls="branch-people">{expanded ? t('fx.closeBranch') : t('fx.whoElse')}<ChevronDown size={13}/></button><div id="branch-people" hidden={!expanded}><div className="fx-branch-tabs"><button className={direction === 'ancestors' ? 'selected' : ''} onClick={()=>{setDirection('ancestors');setLimit(16);}}>דורות קודמים</button><button className={direction === 'descendants' ? 'selected' : ''} onClick={()=>{setDirection('descendants');setLimit(16);}}>צאצאים</button></div><div className="fx-branch-people">{branch.people.slice(0,limit).map(({person:p,depth})=><button key={p.id} onClick={()=>onSelect(p.id)}><Portrait person={p} size="tiny"/><span dir="auto">{p.name}</span><small>{depth} {depth === 1 ? 'דור' : 'דורות'}</small><ChevronLeft size={12}/></button>)}</div>{!branch.count && <p className="fx-empty-small">לא תועדו אנשים נוספים בכיוון הזה.</p>}{branch.count > limit && <button className="fx-text-link fx-load-more" onClick={()=>setLimit(n=>n+30)}>הצגת עוד אנשים<ChevronDown size={13}/></button>}</div></section>;
}

function PersonInspector({ data, person, info, bundle, onSelect, tab, setTab }) {
  const tabs = [{id:'overview',label:t('fx.tabDetails'),icon:UserRound},{id:'timeline',label:t('fx.tabTimeline'),icon:Clock3},{id:'sources',label:t('fx.tabSources'),icon:BookOpen}];
  return <aside className="details-column fx-inspector" id="person-inspector"><section className="details-card fx-details-card"><header className="fx-inspector-heading"><span className="fx-eyebrow">מאחורי השם</span><div><h3>{t('fx.storyOf', { name: person.given || person.name })}</h3><span className="fx-info-mark"><Info size={15}/></span></div><p>{count(info.events.length)} אירועים<span/> {count(info.notes.length)} הערות<span/> {count(info.sourceCount)} מקורות</p></header><div className="fx-inspector-tabs" role="tablist" aria-label="מידע על האדם">{tabs.map(({id,label,icon:Icon},index)=><button key={id} role="tab" id={`person-tab-${id}`} aria-selected={tab === id} aria-controls={`person-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={()=>setTab(id)} onKeyDown={event=>{let next=index;if(event.key === 'ArrowLeft')next=(index+1)%tabs.length;else if(event.key === 'ArrowRight')next=(index+tabs.length-1)%tabs.length;else if(event.key === 'Home')next=0;else if(event.key === 'End')next=tabs.length-1;else return;event.preventDefault();setTab(tabs[next].id);document.getElementById(`person-tab-${tabs[next].id}`)?.focus();}}><Icon size={14}/>{label}{id === 'sources' && !!info.citations.length && <span>{count(info.sourceCount)}</span>}</button>)}</div><div className="fx-inspector-panel" role="tabpanel" id="person-panel-overview" aria-labelledby="person-tab-overview" hidden={tab !== 'overview'}><OverviewPanel person={person} info={info}/></div><div className="fx-inspector-panel" role="tabpanel" id="person-panel-timeline" aria-labelledby="person-tab-timeline" hidden={tab !== 'timeline'}><TimelinePanel info={info}/></div><div className="fx-inspector-panel" role="tabpanel" id="person-panel-sources" aria-labelledby="person-tab-sources" hidden={tab !== 'sources'}><SourcesPanel person={person} info={info} bundle={bundle}/></div><div className="fx-inspector-footer"><ShieldCheck size={12}/><span>רק מידע מתוך הקובץ שלכם</span><bdi>{shortId(person.id)}</bdi></div></section><BranchCard data={data} person={person} onSelect={onSelect}/></aside>;
}

export default function FamilyExperience({ data, person, bundle, onSelect, parentFamily, setParentFamily, history, onHistory, onHelp }) {
  const relations = useMemo(()=>getRelations(data,person.id,parentFamily),[data,person.id,parentFamily]);
  const info = useMemo(()=>personInformation(data,person),[data,person]);
  const preferGrandparentsOpen = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches;
  const [showGrandparents,setShowGrandparents] = useState(preferGrandparentsOpen),[tab,setTab] = useState('overview'),[grandparentFamilies,setGrandparentFamilies] = useState({});
  useEffect(()=>{setTab('overview');setShowGrandparents(preferGrandparentsOpen());setGrandparentFamilies({});},[person.id,data]);
  const grandparents = useMemo(()=>relations.parents.map(parent=>{
    const branch=getRelations(data,parent.id,grandparentFamilies[parent.id]);
    const people=branch.parents.filter(p=>p.id !== person.id && p.id !== parent.id);
    return {parent,people,parentFamilies:branch.parentFamilies,activeParentFamily:branch.activeParentFamily};
  }),[data,relations.parents,grandparentFamilies,person.id]);
  const grandparentCount = new Set(grandparents.flatMap(group=>group.people.map(p=>p.id))).size;
  const parentMarriage = data.families[relations.activeParentFamily]?.marriage;
  const scrollBehavior = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const openGroup = type => {requestAnimationFrame(()=>document.getElementById(`relatives-${type}`)?.scrollIntoView({behavior:scrollBehavior(),block:'nearest'}));};
  const openInspector = nextTab => {setTab(nextTab);requestAnimationFrame(()=>document.getElementById('person-inspector')?.scrollIntoView({behavior:scrollBehavior(),block:window.innerWidth < 801 ? 'start' : 'nearest'}));};
  const openSources = () => openInspector('sources');
  return <div className="family-experience"><div className="workspace-heading fx-workspace-heading" id="family-title"><div className="view-heading"><span className="fx-view-icon"><Network size={16}/></span><h2>{t('fx.familyView')}</h2><span className="fx-view-subtitle">אדם אחד. עולם של חיבורים.</span></div><div className="view-actions"><div className="history-controls"><button className="icon-button" disabled={history.cursor === 0} onClick={()=>onHistory(-1)} aria-label="חזרה לאדם הקודם" title="חזרה לאדם הקודם"><ArrowRight size={16}/></button><button className="icon-button" disabled={history.cursor === history.ids.length-1} onClick={()=>onHistory(1)} aria-label="מעבר לאדם הבא" title="מעבר לאדם הבא"><ArrowLeft size={16}/></button></div><span className="action-divider"/><button className="text-button print-button" onClick={()=>window.print()}><Printer size={15}/><span>הדפסה / PDF</span></button></div></div><div className="content-grid fx-content-grid"><section className="family-panel fx-family-panel" aria-label={`המעגל המשפחתי של ${person.name}`}><header className="fx-canvas-header"><div><h3>{t('fx.closeCircle')}</h3><p>כל החיבורים שמתחילים ב־<bdi>{person.given || person.name}</bdi></p></div><div className="fx-canvas-actions"><button className={`fx-grandparents-toggle ${showGrandparents ? 'selected' : ''}`} onClick={()=>setShowGrandparents(v=>!v)} aria-expanded={showGrandparents && relations.parents.length > 0} aria-controls="grandparents-generation" aria-label={showGrandparents && relations.parents.length > 0 ? t('fx.hideGrandparents') : t('fx.showGrandparents')} disabled={!relations.parents.length}><Layers3 size={14}/><span>סבים וסבתות</span><b>{count(grandparentCount)}</b><ChevronDown className="fx-grandparents-chevron" size={12}/></button><button className="icon-button fx-help" onClick={onHelp} aria-label="איך מנווטים באילן?"><Info size={17}/></button></div></header><div className={`fx-tree-stage ${showGrandparents ? 'fx-three-generations' : ''}`} style={{'--fx-parent-count':Math.max(1,relations.parents.length)}}><div className="fx-generation-label"><span/>{showGrandparents && relations.parents.length > 0 ? t('fx.grandparentsGen') : t('fx.parentsGen')}<span/></div>{relations.parentFamilies.length > 1 && <select className="fx-pedigree-select" aria-label="בחירת משפחת הורים" value={relations.activeParentFamily || ''} onChange={event=>setParentFamily(event.target.value)}>{relations.parentFamilies.map((pf,i)=><option key={pf.id} value={pf.id}>{pedigreeLabel(pf.type)}{i ? ` ${i+1}` : ''}</option>)}</select>}{relations.parents.length > 0 && <GrandparentsGeneration branches={grandparents} open={showGrandparents} onSelect={onSelect} onFamilyChange={(parentId,familyId)=>setGrandparentFamilies(current=>({...current,[parentId]:familyId}))}/>}{relations.parents.length > 0 ? <><div className={`parents-row fx-parents-row ${relations.parents.length === 1 ? 'one-parent' : ''}`}>{relations.parents.map(p=><ParentCard key={p.id} person={p} onSelect={onSelect}/>)}</div><div className={`fx-parent-connector ${relations.parents.length === 1 ? 'one-parent' : ''}`}><svg viewBox="0 0 600 62" preserveAspectRatio="none" fill="none" aria-hidden="true">{relations.parents.length > 1 ? <path d="M150 0V16Q150 31 166 31H434Q450 31 450 16V0M300 31V62"/> : <path d="M300 0V62"/>}<circle cx="300" cy="31" r="4"/></svg>{parentMarriage?.date && <span className="fx-parent-marriage"><Heart size={10}/><bdi>{formatDate(parentMarriage.date)}</bdi></span>}</div></> : <div className="no-parents fx-no-parents"><Sprout size={26}/><strong>{t('fx.branchStarts')}</strong><span>הורים לא תועדו בקובץ. ממשיכים לגלות דרך המשפחה למטה.</span></div>}<FocusCard person={person} info={info} relations={relations} onOpenGroup={openGroup} onSources={openSources}/><div className="fx-focus-stem"><span/></div><button className="fx-canvas-caption" onClick={()=>openInspector('overview')} aria-controls="person-inspector"><BookOpen size={12}/>לפרטים מלאים, אירועים ומקורות<ChevronDown size={11}/></button></div><div className="fx-connected-relatives"><div className="fx-relatives-label"><UsersRound size={13}/><span>{t('fx.familyAround')}</span><span className="fx-relatives-rule"/><span className="fx-compact-hint">הזזה ימינה ושמאלה לכל הרשימה</span></div><RelativeSection title="בני ובנות זוג" icon={Heart} people={relations.partners} type="partners" onSelect={onSelect}/><RelativeSection title="ילדים וילדות" icon={Baby} people={relations.children} type="children" onSelect={onSelect}/><RelativeSection title="אחים ואחיות" icon={UsersRound} people={relations.siblings} type="siblings" onSelect={onSelect}/></div><footer className="fx-canvas-footer"><span><span className="fx-legend-current"/>האדם הנבחר</span><span><span className="fx-legend-parent"/>הורים במבט מלא</span><span><ShieldCheck size={11}/>פענוח רק במכשיר</span></footer></section><PersonInspector data={data} person={person} info={info} bundle={bundle} onSelect={onSelect} tab={tab} setTab={setTab}/></div></div>;
}
