import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { acquireBodyScrollLock, restoreFocusSafely } from './scroll-lock.js';
import {
  Pencil,
  X,
  LoaderCircle,
  AlertTriangle,
  Check,
  Bug,
  Key,
  ExternalLink,
  Sparkles,
  Eye,
  EyeOff,
  Settings,
  UserPlus,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import {
  analyzePersonTextWithAi,
  getActiveAiProvider,
  getGeminiApiKey,
  setGeminiApiKey,
  removeGeminiApiKey,
  testGeminiApiKey,
  OPENROUTER_PRESET_MODELS,
  getOpenRouterApiKey,
  setOpenRouterApiKey,
  removeOpenRouterApiKey,
  getOpenRouterModel,
  setOpenRouterModel as saveOpenRouterModel,
  testOpenRouterApiKey,
  setPreferredCloudProvider,
  hasConfiguredAi,
  markAiConfigured,
  getDefaultEditMode,
  shouldShowAiSettingsByDefault,
  extractCurrentPersonFields,
} from './ai-service.js';
import { applyPersonUpdatesWithReport, validatePersonUpdates } from './gedcom-ai-editor.js';
import { getRelations, lifeLabel, normalize } from './gedcom.js';
import {
  MANUAL_TAG_GROUPS,
  RELATION_LABELS_HE,
  PEDIGREE_TYPES,
  EVENT_NAMES,
  ATTRIBUTE_NAMES,
  inferSexFromRelation,
  relationCategory,
} from './gedcom-tags.js';

const FIELD_LABELS = {
  givenName: 'שם פרטי',
  surname: 'שם משפחה',
  nickname: 'כינוי',
  namePrefix: 'קידומת שם',
  surnamePrefix: 'קידומת שם משפחה',
  nameSuffix: 'סיומת שם',
  birthSurname: 'שם נעורים / לידה',
  maidenName: 'שם נעורים',
  marriedSurname: 'שם נישואים',
  alternateNames: 'שמות נוספים',
  sex: 'מין',
  birthDate: 'תאריך לידה',
  birthPlace: 'מקום לידה',
  christeningDate: 'תאריך הטבלה בילדות',
  christeningPlace: 'מקום הטבלה בילדות',
  adultChristeningDate: 'תאריך הטבלה בבגרות',
  adultChristeningPlace: 'מקום הטבלה בבגרות',
  deathDate: 'תאריך פטירה',
  deathPlace: 'מקום פטירה',
  deathCause: 'סיבת פטירה',
  burialDate: 'תאריך קבורה',
  burialPlace: 'מקום קבורה',
  cremationDate: 'תאריך שריפה',
  cremationPlace: 'מקום שריפה',
  adoptionDate: 'תאריך אימוץ',
  adoptionPlace: 'מקום אימוץ',
  immigrationDate: 'תאריך עלייה / הגירה',
  immigrationPlace: 'מקום עלייה',
  emigrationDate: 'תאריך הגירה',
  emigrationPlace: 'מקום הגירה',
  naturalizationDate: 'תאריך התאזרחות',
  naturalizationPlace: 'מקום התאזרחות',
  barMitzvahDate: 'תאריך בר מצווה',
  barMitzvahPlace: 'מקום בר מצווה',
  batMitzvahDate: 'תאריך בת מצווה',
  batMitzvahPlace: 'מקום בת מצווה',
  baptismDate: 'תאריך טבילה',
  baptismPlace: 'מקום טבילה',
  blessingDate: 'תאריך ברכה',
  blessingPlace: 'מקום ברכה',
  confirmationDate: 'תאריך קונפירמציה',
  confirmationPlace: 'מקום קונפירמציה',
  firstCommunionDate: 'תאריך לחם הקודש הראשון',
  firstCommunionPlace: 'מקום לחם הקודש הראשון',
  ordinationDate: 'תאריך הסמכה לרבנות / כמורה',
  ordinationPlace: 'מקום הסמכה',
  censusDate: 'תאריך מפקד אוכלוסין',
  censusPlace: 'מקום מפקד אוכלוסין',
  probateDate: 'תאריך אישור צוואה',
  probatePlace: 'מקום אישור צוואה',
  willDate: 'תאריך צוואה',
  willPlace: 'מקום צוואה',
  graduationDate: 'תאריך סיום לימודים',
  graduationPlace: 'מקום סיום לימודים',
  retirementDate: 'תאריך פרישה',
  retirementPlace: 'מקום פרישה',
  militaryDate: 'תאריך שירות צבאי',
  militaryPlace: 'מקום שירות צבאי',
  circumcisionDate: 'תאריך ברית מילה',
  circumcisionPlace: 'מקום ברית מילה',
  occupation: 'עיסוק',
  education: 'השכלה',
  residencePlace: 'מקום מגורים',
  residenceDate: 'תאריך מגורים',
  title: 'תואר',
  religion: 'דת',
  nationality: 'לאום',
  description: 'תיאור',
  idNumber: 'מזהה / ת״ז',
  caste: 'מעמד / קאסטה',
  property: 'רכוש / נכסים',
  ssn: 'מספר ביטוח לאומי',
  childrenCount: 'מספר ילדים',
  marriageCount: 'מספר נישואים',
  phone: 'טלפון',
  email: 'דוא״ל',
  website: 'אתר אינטרנט',
  fax: 'פקס',
  address: 'כתובת',
  referenceNumber: 'מספר סימוכין',
  rin: 'מזהה מערכת',
  uid: 'מזהה ייחודי',
  externalId: 'מזהה חיצוני',
  afn: 'מספר קובץ אבות',
  rfn: 'מזהה רשומה קבוע',
  restriction: 'הגבלת פרטיות',
  alias: 'כינוי / הפניה',
  notes: 'הערות',
  source: 'מקור',
};

const PEDIGREE_LABELS = {
  birth: 'ביולוגי / לידה',
  adopted: 'אימוץ',
  foster: 'אומנה',
  sealing: 'קישור דתי / Sealing',
};

const ALL_TAG_OPTIONS = MANUAL_TAG_GROUPS.flatMap(g => g.options);

function findTagOption(optionKey) {
  return ALL_TAG_OPTIONS.find(o => o.key === optionKey) || ALL_TAG_OPTIONS[0];
}

function formatDiffValue(val) {
  if (Array.isArray(val)) return val.join(' · ') || '—';
  const s = String(val ?? '').trim();
  return s || '—';
}

const DRAFT_REL_PREVIEW_KEYS = new Set([
  'relation',
  'givenName',
  'surname',
  'sex',
  'birthDate',
  'birthPlace',
  'deathDate',
  'deathPlace',
  'occupation',
  'marriageDate',
  'marriagePlace',
  'divorceDate',
  'engagementDate',
  'pedigree',
  'existingPersonId',
  'otherParentName',
  'targetFamilyId',
  'halfParentId',
  'notes',
]);

function makeEmptyFamilyForm() {
  return {
    relation: 'child',
    linkMode: 'new',
    existingPersonId: '',
    existingSearch: '',
    givenName: '',
    surname: '',
    sex: inferSexFromRelation('child'),
    birthDate: '',
    birthPlace: '',
    deathDate: '',
    deathPlace: '',
    occupation: '',
    note: '',
    pedigree: 'birth',
    targetFamilyId: '',
    halfParentId: '',
    marriageDate: '',
    marriagePlace: '',
    divorceDate: '',
    engagementDate: '',
    attachToExistingFamily: false,
  };
}

export function EditPersonAiModal({
  isOpen,
  onClose,
  person,
  bundle,
  onApplyUpdate,
  devMode,
  setDevMode,
}) {
  const [aiConfigured, setAiConfigured] = useState(() => hasConfiguredAi());
  const [mode, setMode] = useState(() => getDefaultEditMode());
  const [text, setText] = useState('');
  const [manualForm, setManualForm] = useState({
    givenName: '',
    surname: '',
    sex: 'U',
    birthDate: '',
    birthPlace: '',
    deathDate: '',
    deathPlace: '',
    deathCause: '',
    occupation: '',
    residencePlace: '',
    title: '',
    note: '',
    source: '',
  });
  const [extraTags, setExtraTags] = useState([]);
  const [familyForm, setFamilyForm] = useState(() => makeEmptyFamilyForm());

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);
  const [pendingUpdate, setPendingUpdate] = useState(null);
  const [activeProvider, setActiveProvider] = useState(null);
  const [progressInfo, setProgressInfo] = useState(null);
  const [configNotice, setConfigNotice] = useState('');

  // API Key management (OpenRouter + Gemini)
  const [keyTab, setKeyTab] = useState('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [openRouterModel, setOpenRouterModel] = useState(OPENROUTER_PRESET_MODELS[0].id);
  const [customModelMode, setCustomModelMode] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(() => shouldShowAiSettingsByDefault());
  const [showKeyText, setShowKeyText] = useState(false);
  const [keyStatus, setKeyStatus] = useState(null);
  const [testingKey, setTestingKey] = useState(false);

  const relations = useMemo(
    () => (bundle?.data && person?.id ? getRelations(bundle.data, person.id) : { parents: [], siblings: [], partners: [], children: [], parentFamilies: [] }),
    [bundle?.data, person?.id],
  );

  const spouseFamilyOptions = useMemo(() => {
    const fids = person?.spouseFamilies || [];
    return fids.map(fid => {
      const fam = bundle?.data?.families?.[fid];
      const partnerNames = (fam?.partners || [])
        .filter(pid => pid !== person.id)
        .map(pid => bundle?.data?.people?.[pid]?.name)
        .filter(Boolean);
      const label = partnerNames.length
        ? `${partnerNames.join(' ו')}${fam?.marriage?.date ? ` (${fam.marriage.date})` : ''}`
        : `משפחה קיימת (${fid.replaceAll('@', '')})`;
      return { id: fid, label, partners: fam?.partners || [], children: fam?.children || [] };
    });
  }, [bundle?.data, person?.id, person?.spouseFamilies]);

  const singlePartnerChildFamily = useMemo(
    () => spouseFamilyOptions.find(f => f.partners.length <= 1 && f.children.length > 0) || null,
    [spouseFamilyOptions],
  );

  const existingPeopleMatches = useMemo(() => {
    const data = bundle?.data;
    if (!data?.order) return [];
    const terms = normalize(familyForm.existingSearch).split(/\s+/).filter(Boolean);
    return data.order
      .filter(pid => pid !== person.id)
      .map(pid => data.people[pid])
      .filter(p => p && (!terms.length || terms.every(t => p.search.includes(t))))
      .slice(0, 30);
  }, [bundle?.data, person?.id, familyForm.existingSearch]);

  useEffect(() => {
    if (isOpen) {
      const configured = hasConfiguredAi();
      setAiConfigured(configured);
      setMode(getDefaultEditMode());
      setShowKeyInput(shouldShowAiSettingsByDefault());
      setConfigNotice('');

      setText('');
      setError('');
      setDebugInfo(null);
      setPendingUpdate(null);
      setProgressInfo(null);
      setKeyStatus(null);
      const latestResidence = [...(person.events || [])].reverse().find(e => e.type === 'RESI');
      const titleAttr = (person.attributes || []).find(a => a.type === 'TITL')?.value || '';
      setManualForm({
        givenName: person.given || '',
        surname: person.surname || '',
        sex: ['M', 'F', 'U'].includes(person.sex) ? person.sex : 'U',
        birthDate: person.birth?.date || '',
        birthPlace: person.birth?.place || '',
        deathDate: person.death?.date || '',
        deathPlace: person.death?.place || '',
        deathCause: person.death?.cause || '',
        occupation: person.occupation || '',
        residencePlace: latestResidence?.place || latestResidence?.detail || '',
        title: titleAttr,
        note: '',
        source: '',
      });
      setExtraTags([]);
      setFamilyForm(makeEmptyFamilyForm());

      const savedGeminiKey = getGeminiApiKey();
      const savedOrKey = getOpenRouterApiKey();
      const savedOrModel = getOpenRouterModel();
      setApiKey(savedGeminiKey);
      setOpenRouterKey(savedOrKey);
      setOpenRouterModel(savedOrModel);
      setCustomModelMode(!OPENROUTER_PRESET_MODELS.some((m) => m.id === savedOrModel));

      getActiveAiProvider().then((provider) => {
        setActiveProvider(provider);
        if (provider.id === 'gemini') setKeyTab('gemini');
        else if (provider.id === 'openrouter') setKeyTab('openrouter');
        else if (savedGeminiKey && !savedOrKey) setKeyTab('gemini');
        else setKeyTab('openrouter');
      });
    }
  }, [isOpen, person.id]);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement;
    const releaseScrollLock = acquireBodyScrollLock();
    return () => {
      releaseScrollLock();
      restoreFocusSafely(previousFocus);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const refreshProvider = async () => {
    const provider = await getActiveAiProvider();
    setActiveProvider(provider);
  };

  const completeAiConfiguration = (cfgMode, message) => {
    markAiConfigured(cfgMode);
    setAiConfigured(true);
    setShowKeyInput(false);
    setConfigNotice(message || 'AI הוגדר כברירת מחדל — ההגדרות הוסתרו וניתנות לעריכה דרך כפתור ״הגדרות AI״.');
  };

  const handleSaveKey = () => {
    setGeminiApiKey(apiKey);
    if (apiKey.trim()) {
      setPreferredCloudProvider('gemini');
      refreshProvider();
      completeAiConfiguration('cloud', 'מפתח Gemini נשמר — מעתה עריכת AI תיפתח כברירת מחדל וההגדרות יוסתרו.');
      setKeyStatus({ type: 'success', message: 'מפתח Gemini נשמר בהצלחה במכשיר זה.' });
    } else {
      refreshProvider();
      const stillConfigured = hasConfiguredAi();
      setAiConfigured(stillConfigured);
      if (!stillConfigured) setShowKeyInput(true);
      setKeyStatus({ type: 'info', message: 'המפתח הוסר.' });
    }
  };

  const handleRemoveKey = () => {
    setApiKey('');
    removeGeminiApiKey();
    refreshProvider();
    const stillConfigured = hasConfiguredAi();
    setAiConfigured(stillConfigured);
    setConfigNotice('');
    if (!stillConfigured) setShowKeyInput(true);
    setKeyStatus({
      type: 'info',
      message: 'מפתח Gemini הוסר ממכשיר זה.',
    });
  };

  const handleTestKey = async () => {
    if (!apiKey.trim()) {
      setKeyStatus({ type: 'error', message: 'אנא הזן מפתח API לבדיקה.' });
      return;
    }
    setTestingKey(true);
    setKeyStatus(null);
    try {
      const res = await testGeminiApiKey(apiKey.trim());
      if (res.ok) {
        setGeminiApiKey(apiKey);
        setPreferredCloudProvider('gemini');
        refreshProvider();
        completeAiConfiguration('cloud', '✓ מפתח Gemini אומת ונשמר כברירת מחדל.');
        setKeyStatus({ type: 'success', message: '✓ מפתח Gemini תקין ומוכן לשימוש!' });
      } else {
        setKeyStatus({ type: 'error', message: `שגיאה באימות המפתח: ${res.error}` });
      }
    } catch (err) {
      setKeyStatus({ type: 'error', message: `שגיאה: ${err.message}` });
    } finally {
      setTestingKey(false);
    }
  };

  const handleSaveOpenRouterKey = () => {
    setOpenRouterApiKey(openRouterKey);
    saveOpenRouterModel(openRouterModel);
    if (openRouterKey.trim()) {
      setPreferredCloudProvider('openrouter');
      refreshProvider();
      completeAiConfiguration('cloud', 'מפתח OpenRouter נשמר — מעתה עריכת AI תיפתח כברירת מחדל וההגדרות יוסתרו.');
      setKeyStatus({ type: 'success', message: 'מפתח OpenRouter והמודל נשמרו בהצלחה במכשיר זה.' });
    } else {
      refreshProvider();
      const stillConfigured = hasConfiguredAi();
      setAiConfigured(stillConfigured);
      if (!stillConfigured) setShowKeyInput(true);
      setKeyStatus({ type: 'info', message: 'מפתח OpenRouter הוסר.' });
    }
  };

  const handleRemoveOpenRouterKey = () => {
    setOpenRouterKey('');
    removeOpenRouterApiKey();
    refreshProvider();
    const stillConfigured = hasConfiguredAi();
    setAiConfigured(stillConfigured);
    setConfigNotice('');
    if (!stillConfigured) setShowKeyInput(true);
    setKeyStatus({
      type: 'info',
      message: 'מפתח OpenRouter הוסר ממכשיר זה.',
    });
  };

  const handleTestOpenRouterKey = async () => {
    if (!openRouterKey.trim()) {
      setKeyStatus({ type: 'error', message: 'אנא הזן מפתח OpenRouter API לבדיקה.' });
      return;
    }
    setTestingKey(true);
    setKeyStatus(null);
    try {
      const res = await testOpenRouterApiKey(openRouterKey.trim(), { model: openRouterModel.trim() });
      if (res.ok) {
        setOpenRouterApiKey(openRouterKey);
        saveOpenRouterModel(openRouterModel);
        setPreferredCloudProvider('openrouter');
        refreshProvider();
        completeAiConfiguration('cloud', '✓ מפתח OpenRouter אומת ונשמר כברירת מחדל.');
        setKeyStatus({ type: 'success', message: '✓ מפתח OpenRouter תקין ומוכן לשימוש!' });
      } else {
        setKeyStatus({ type: 'error', message: `שגיאה באימות המפתח: ${res.error}` });
      }
    } catch (err) {
      setKeyStatus({ type: 'error', message: `שגיאה: ${err.message}` });
    } finally {
      setTestingKey(false);
    }
  };

  const handleUseLocalAiDefault = () => {
    completeAiConfiguration('local', 'מנוע AI מקומי הוגדר כברירת מחדל — ההגדרות הוסתרו.');
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!text.trim() || busy) return;

    setBusy(true);
    setError('');
    setDebugInfo(null);
    setPendingUpdate(null);
    setProgressInfo(null);

    try {
      const result = await analyzePersonTextWithAi(person, text, {
        devMode,
        data: bundle.data,
        onProgress: (info) => {
          setProgressInfo(info);
        },
      });

      setDebugInfo({
        rawResponse: result.rawResponse,
        parsedJson: result.parsedJson,
        diff: result.diff,
        errors: result.errors,
        valid: result.valid,
        provider: result.provider,
        warnings: result.warnings || [],
      });

      if (!result.valid) {
        setError(result.errors.join(' | '));
        setBusy(false);
        return;
      }

      const hasChanges = result.sanitized && Object.keys(result.sanitized).length > 0;
      if (!hasChanges) {
        setError('לא זוהו שינויים או שדות חדשים לעדכון מתוך הטקסט שהוזן.');
        setBusy(false);
        return;
      }

      if (!hasConfiguredAi()) {
        completeAiConfiguration(
          result.provider === 'gemini' || result.provider === 'openrouter' ? 'cloud' : 'local',
        );
      }

      const structuredKeys = new Set(['relatives', 'events', 'attributes', 'familyEvents', 'customTags']);
      const draftItems = Object.entries(result.diff)
        .filter(([field]) => !structuredKeys.has(field))
        .map(([field, change]) => ({
          field,
          old: change.old,
          value: Array.isArray(change.new) ? change.new.join('\n') : String(change.new ?? ''),
          isArray: Array.isArray(change.new),
          checked: true,
        }));

      const draftRelatives = (result.sanitized.relatives || []).map((rel, idx) => {
        const fullName = [rel.givenName, rel.surname].filter(Boolean).join(' ').trim();
        const existingMatch = rel.existingPersonId
          ? bundle.data?.people?.[rel.existingPersonId]
          : fullName
            ? Object.values(bundle.data?.people || {}).find(
                p => p.id !== person.id && normalize(p.name) === normalize(fullName),
              )
            : null;
        const rawExtras = {};
        for (const [k, v] of Object.entries(rel)) {
          if (!DRAFT_REL_PREVIEW_KEYS.has(k) && v !== undefined) rawExtras[k] = v;
        }
        return {
          key: `rel-${idx}`,
          checked: true,
          relation: rel.relation,
          givenName: rel.givenName || '',
          surname: rel.surname || '',
          sex: rel.sex || inferSexFromRelation(rel.relation),
          birthDate: rel.birthDate || '',
          birthPlace: rel.birthPlace || '',
          deathDate: rel.deathDate || '',
          deathPlace: rel.deathPlace || '',
          occupation: rel.occupation || '',
          marriageDate: rel.marriageDate || '',
          marriagePlace: rel.marriagePlace || '',
          divorceDate: rel.divorceDate || '',
          engagementDate: rel.engagementDate || '',
          pedigree: rel.pedigree || 'birth',
          existingPersonId: rel.existingPersonId || '',
          matchedPersonId: existingMatch?.id || '',
          matchedPersonName: existingMatch?.name || '',
          otherParentName: rel.otherParentName || '',
          targetFamilyId: rel.targetFamilyId || '',
          halfParentId: rel.halfParentId || '',
          notes: Array.isArray(rel.notes) ? rel.notes.join('\n') : '',
          rawExtras,
        };
      });

      const draftTags = [
        ...(result.sanitized.events || []).map((ev, idx) => ({
          key: `ev-${idx}`,
          checked: true,
          kind: 'event',
          ...ev,
        })),
        ...(result.sanitized.attributes || []).map((at, idx) => ({
          key: `attr-${idx}`,
          checked: true,
          kind: 'attribute',
          ...at,
        })),
        ...(result.sanitized.familyEvents || []).map((fe, idx) => ({
          key: `fe-${idx}`,
          checked: true,
          kind: 'familyEvent',
          ...fe,
        })),
        ...(result.sanitized.customTags || []).map((ct, idx) => ({
          key: `ct-${idx}`,
          checked: true,
          kind: 'custom',
          ...ct,
        })),
      ];

      setPendingUpdate({
        items: draftItems,
        relatives: draftRelatives,
        structuredTags: draftTags,
        diff: result.diff,
      });
    } catch (err) {
      console.error('[AI Editor] Failed:', err);
      setError(err.message || 'אירעה שגיאה בעיבוד הטקסט.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmPending = () => {
    if (!pendingUpdate) return;
    const rawUpdates = {};
    for (const item of pendingUpdate.items || []) {
      if (!item.checked) continue;
      if (item.isArray) {
        const arr = item.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (arr.length) rawUpdates[item.field] = arr;
      } else {
        const val = item.value.trim();
        if (val) rawUpdates[item.field] = val;
      }
    }

    const checkedRelatives = (pendingUpdate.relatives || [])
      .filter(r => r.checked)
      .map(r => {
        const out = { ...(r.rawExtras || {}), relation: r.relation };
        if (r.existingPersonId) {
          out.existingPersonId = r.existingPersonId;
        } else {
          if (r.givenName.trim()) out.givenName = r.givenName.trim();
          if (r.surname.trim()) out.surname = r.surname.trim();
          if (r.sex) out.sex = r.sex;
        }
        if (r.birthDate.trim()) out.birthDate = r.birthDate.trim();
        if (r.birthPlace.trim()) out.birthPlace = r.birthPlace.trim();
        if (r.deathDate.trim()) out.deathDate = r.deathDate.trim();
        if (r.deathPlace.trim()) out.deathPlace = r.deathPlace.trim();
        if (r.occupation.trim()) out.occupation = r.occupation.trim();
        if (r.marriageDate.trim()) out.marriageDate = r.marriageDate.trim();
        if (r.marriagePlace.trim()) out.marriagePlace = r.marriagePlace.trim();
        if (r.divorceDate.trim()) out.divorceDate = r.divorceDate.trim();
        if (r.engagementDate.trim()) out.engagementDate = r.engagementDate.trim();
        if (r.pedigree && r.pedigree !== 'birth') out.pedigree = r.pedigree;
        if (r.otherParentName.trim()) out.otherParentName = r.otherParentName.trim();
        if (r.targetFamilyId) out.targetFamilyId = r.targetFamilyId;
        if (r.halfParentId) out.halfParentId = r.halfParentId;
        if (r.notes.trim()) {
          out.notes = r.notes.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        }
        return out;
      });
    if (checkedRelatives.length) rawUpdates.relatives = checkedRelatives;

    for (const tagItem of pendingUpdate.structuredTags || []) {
      if (!tagItem.checked) continue;
      const entry = { tag: tagItem.tag };
      for (const k of ['type', 'value', 'date', 'place', 'detail', 'cause', 'address', 'agency', 'age', 'religion', 'note', 'familyId', 'partnerId', 'partnerName', 'phone', 'email', 'www']) {
        if (typeof tagItem[k] === 'string' && tagItem[k].trim()) entry[k] = tagItem[k].trim();
      }
      if (tagItem.kind === 'event') {
        rawUpdates.events = [...(rawUpdates.events || []), entry];
      } else if (tagItem.kind === 'attribute') {
        rawUpdates.attributes = [...(rawUpdates.attributes || []), entry];
      } else if (tagItem.kind === 'familyEvent') {
        rawUpdates.familyEvents = [...(rawUpdates.familyEvents || []), entry];
      } else if (tagItem.kind === 'custom') {
        rawUpdates.customTags = [...(rawUpdates.customTags || []), entry];
      }
    }

    if (!Object.keys(rawUpdates).length) {
      setError('לא נבחרו שדות לעדכון.');
      return;
    }

    const validation = validatePersonUpdates(
      rawUpdates,
      extractCurrentPersonFields(person),
      { data: bundle.data, personId: person.id },
    );
    if (!validation.valid) {
      setError(validation.errors.join(' | '));
      return;
    }
    try {
      const report = applyPersonUpdatesWithReport(bundle.raw, person.id, validation.sanitized);
      const summary = report.createdPeople.length
        ? `הפרטים עודכנו ונוספו ${report.createdPeople.length} בני משפחה לאילן.`
        : 'הפרטים עודכנו בהצלחה ב-GEDCOM.';
      onApplyUpdate({ updatedRaw: report.raw, updates: validation.sanitized, diff: validation.diff, summary });
      setPendingUpdate(null);
      onClose();
    } catch (err) {
      setError(err.message || 'שגיאה בשמירת השינויים.');
    }
  };

  const handleManualSubmit = (e) => {
    e?.preventDefault();
    if (busy) return;
    setError('');
    const latestResidence = [...(person.events || [])].reverse().find(ev => ev.type === 'RESI');
    const currentResidence = latestResidence?.place || latestResidence?.detail || '';
    const currentTitle = (person.attributes || []).find(a => a.type === 'TITL')?.value || '';
    const rawUpdates = {};
    if (manualForm.givenName.trim() !== (person.given || '').trim()) rawUpdates.givenName = manualForm.givenName;
    if (manualForm.surname.trim() !== (person.surname || '').trim()) rawUpdates.surname = manualForm.surname;
    if (manualForm.sex !== (['M', 'F', 'U'].includes(person.sex) ? person.sex : 'U')) rawUpdates.sex = manualForm.sex;
    if (manualForm.birthDate.trim() !== (person.birth?.date || '').trim()) rawUpdates.birthDate = manualForm.birthDate;
    if (manualForm.birthPlace.trim() !== (person.birth?.place || '').trim()) rawUpdates.birthPlace = manualForm.birthPlace;
    if (manualForm.deathDate.trim() !== (person.death?.date || '').trim()) rawUpdates.deathDate = manualForm.deathDate;
    if (manualForm.deathPlace.trim() !== (person.death?.place || '').trim()) rawUpdates.deathPlace = manualForm.deathPlace;
    if (manualForm.deathCause.trim() !== (person.death?.cause || '').trim()) rawUpdates.deathCause = manualForm.deathCause;
    if (manualForm.occupation.trim() !== (person.occupation || '').trim()) rawUpdates.occupation = manualForm.occupation;
    if (manualForm.residencePlace.trim() !== currentResidence.trim()) rawUpdates.residencePlace = manualForm.residencePlace;
    if (manualForm.title.trim() !== currentTitle.trim()) rawUpdates.title = manualForm.title;
    if (manualForm.note.trim()) rawUpdates.notes = [manualForm.note];
    if (manualForm.source.trim()) rawUpdates.source = manualForm.source;

    for (const row of extraTags) {
      const opt = findTagOption(row.optionKey);
      if (opt.kind === 'scalar') {
        const val = row.value.trim();
        if (!val) continue;
        if (opt.fieldKey === 'alternateName') {
          rawUpdates.alternateNames = [...(rawUpdates.alternateNames || []), val];
        } else {
          rawUpdates[opt.fieldKey] = val;
        }
      } else if (opt.kind === 'event') {
        const entry = { tag: opt.tag };
        if (row.type.trim()) entry.type = row.type.trim();
        if (row.date.trim()) entry.date = row.date.trim();
        if (row.place.trim()) entry.place = row.place.trim();
        if (row.detail.trim()) entry.detail = row.detail.trim();
        rawUpdates.events = [...(rawUpdates.events || []), entry];
      } else if (opt.kind === 'attribute') {
        const entry = { tag: opt.tag };
        if (row.type.trim()) entry.type = row.type.trim();
        if (row.value.trim()) entry.value = row.value.trim();
        if (row.date.trim()) entry.date = row.date.trim();
        if (row.place.trim()) entry.place = row.place.trim();
        rawUpdates.attributes = [...(rawUpdates.attributes || []), entry];
      } else if (opt.kind === 'familyEvent') {
        const entry = { tag: opt.tag };
        if (row.familyId) entry.familyId = row.familyId;
        if (row.type.trim()) entry.type = row.type.trim();
        if (row.date.trim()) entry.date = row.date.trim();
        if (row.place.trim()) entry.place = row.place.trim();
        if (row.detail.trim()) entry.detail = row.detail.trim();
        rawUpdates.familyEvents = [...(rawUpdates.familyEvents || []), entry];
      } else if (opt.kind === 'custom') {
        const entry = { tag: row.customTag.trim().toUpperCase() };
        if (row.value.trim()) entry.value = row.value.trim();
        if (row.date.trim()) entry.date = row.date.trim();
        if (row.place.trim()) entry.place = row.place.trim();
        rawUpdates.customTags = [...(rawUpdates.customTags || []), entry];
      }
    }

    if (!Object.keys(rawUpdates).length) {
      setError('לא בוצעו שינויים בשדות.');
      return;
    }

    const validation = validatePersonUpdates(
      rawUpdates,
      extractCurrentPersonFields(person),
      { data: bundle.data, personId: person.id },
    );
    if (!validation.valid) {
      setError(validation.errors.join(' | '));
      return;
    }
    try {
      const report = applyPersonUpdatesWithReport(bundle.raw, person.id, validation.sanitized);
      onApplyUpdate({ updatedRaw: report.raw, updates: validation.sanitized, diff: validation.diff });
      onClose();
    } catch (err) {
      setError(err.message || 'שגיאה בשמירת השינויים.');
    }
  };

  const handleAddFamilySubmit = (e) => {
    e?.preventDefault();
    if (busy) return;
    setError('');
    const cat = relationCategory(familyForm.relation);
    const relEntry = {
      relation: familyForm.relation,
    };

    if (familyForm.linkMode === 'existing') {
      if (!familyForm.existingPersonId) {
        setError('יש לבחור אדם קיים מהאילן לקישור.');
        return;
      }
      relEntry.existingPersonId = familyForm.existingPersonId;
    } else {
      if (familyForm.givenName.trim()) relEntry.givenName = familyForm.givenName.trim();
      if (familyForm.surname.trim()) relEntry.surname = familyForm.surname.trim();
      relEntry.sex = familyForm.sex;
      if (familyForm.birthDate.trim()) relEntry.birthDate = familyForm.birthDate.trim();
      if (familyForm.birthPlace.trim()) relEntry.birthPlace = familyForm.birthPlace.trim();
      if (familyForm.deathDate.trim()) relEntry.deathDate = familyForm.deathDate.trim();
      if (familyForm.deathPlace.trim()) relEntry.deathPlace = familyForm.deathPlace.trim();
      if (familyForm.occupation.trim()) relEntry.occupation = familyForm.occupation.trim();
      if (familyForm.note.trim()) relEntry.notes = [familyForm.note.trim()];
    }

    if (cat === 'parent' || cat === 'child') {
      if (familyForm.pedigree && familyForm.pedigree !== 'birth') {
        relEntry.pedigree = familyForm.pedigree;
      }
    }
    if (cat === 'child') {
      if (familyForm.targetFamilyId === '__new_single__') {
        relEntry.createNewFamily = true;
      } else if (familyForm.targetFamilyId) {
        relEntry.targetFamilyId = familyForm.targetFamilyId;
      }
    }
    if (cat === 'parent' && familyForm.targetFamilyId) {
      relEntry.targetFamilyId = familyForm.targetFamilyId;
    }
    if (cat === 'sibling' && familyForm.halfParentId) {
      relEntry.halfParentId = familyForm.halfParentId;
    }
    if (cat === 'spouse') {
      if (familyForm.marriageDate.trim()) relEntry.marriageDate = familyForm.marriageDate.trim();
      if (familyForm.marriagePlace.trim()) relEntry.marriagePlace = familyForm.marriagePlace.trim();
      if (familyForm.divorceDate.trim()) relEntry.divorceDate = familyForm.divorceDate.trim();
      if (familyForm.engagementDate.trim()) relEntry.engagementDate = familyForm.engagementDate.trim();
      if (familyForm.attachToExistingFamily && singlePartnerChildFamily) {
        relEntry.targetFamilyId = singlePartnerChildFamily.id;
      }
    }

    const validation = validatePersonUpdates(
      { relatives: [relEntry] },
      {},
      { data: bundle.data, personId: person.id },
    );
    if (!validation.valid) {
      setError(validation.errors.join(' | '));
      return;
    }
    try {
      const report = applyPersonUpdatesWithReport(bundle.raw, person.id, validation.sanitized);
      const summary = familyForm.linkMode === 'existing'
        ? 'הקשר המשפחתי נוסף לאילן.'
        : 'בן המשפחה נוסף בהצלחה לאילן.';
      onApplyUpdate({ updatedRaw: report.raw, updates: validation.sanitized, diff: validation.diff, summary });
      onClose();
    } catch (err) {
      setError(err.message || 'שגיאה בהוספת בן המשפחה.');
    }
  };

  const addExtraTagRow = () => {
    setExtraTags(prev => [
      ...prev,
      {
        id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        optionKey: 'EVENT:BURI',
        customTag: '',
        type: '',
        value: '',
        date: '',
        place: '',
        detail: '',
        familyId: spouseFamilyOptions[0]?.id || '',
      },
    ]);
  };

  const hasPendingChanges = Boolean(
    pendingUpdate &&
      (pendingUpdate.items?.some(it => it.checked) ||
        pendingUpdate.relatives?.some(r => r.checked) ||
        pendingUpdate.structuredTags?.some(t => t.checked)),
  );

  const visibleTagGroups = MANUAL_TAG_GROUPS.filter(
    g => g.id !== 'familyEvents' || spouseFamilyOptions.length > 0,
  );

  const familyCategory = relationCategory(familyForm.relation);

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="dialog ai-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-edit-title"
        style={{
          maxWidth: 560,
          width: '94%',
          maxHeight: 'calc(100dvh - 24px)',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <button
          className="icon-button dialog-close"
          onClick={onClose}
          disabled={busy}
          aria-label="סגירה"
        >
          <X size={20} />
        </button>

        <div className="dialog-heading">
          <span className="dialog-icon" style={{ background: '#f5eee6', color: '#8d5b43' }}>
            {mode === 'family' ? <UserPlus size={22} /> : <Pencil size={22} />}
          </span>
          <h2 id="ai-edit-title">
            {mode === 'manual'
              ? 'עריכת פרטים ידנית'
              : mode === 'family'
              ? 'הוספת בן משפחה'
              : 'עריכת פרטים באמצעות AI'}
          </h2>
          <p>
            {mode === 'family' ? (
              <>
                קישור או יצירת הורה, בן/בת זוג, ילד/ה או אח/ות עבור <strong dir="auto">{person.name}</strong>.
              </>
            ) : (
              <>
                עדכון נתונים עבור <strong dir="auto">{person.name}</strong>{' '}
                {mode === 'manual'
                  ? '— תמיכה מלאה בכל תגיות GEDCOM, גם אופליין.'
                  : 'על בסיס טקסט חופשי, כולל תגיות GEDCOM והוספת בני משפחה.'}
              </>
            )}
          </p>
        </div>

        <div className="edit-mode-tabs" role="tablist" aria-label="מצב עריכה">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'ai'}
            className={mode === 'ai' ? 'selected' : ''}
            disabled={busy}
            onClick={() => {
              setMode('ai');
              setError('');
              if (!aiConfigured) setShowKeyInput(true);
            }}
          >
            עריכה עם AI
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'manual'}
            className={mode === 'manual' ? 'selected' : ''}
            disabled={busy}
            onClick={() => {
              setMode('manual');
              setError('');
              setPendingUpdate(null);
            }}
          >
            עריכה ידנית
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'family'}
            className={mode === 'family' ? 'selected' : ''}
            disabled={busy}
            onClick={() => {
              setMode('family');
              setError('');
              setPendingUpdate(null);
            }}
          >
            הוספת בן משפחה
          </button>
        </div>

        {mode === 'manual' ? (
          <form onSubmit={handleManualSubmit}>
            <div className="manual-edit-grid">
              <div className="manual-edit-field">
                <label htmlFor="manual-given">שם פרטי</label>
                <input id="manual-given" value={manualForm.givenName} onChange={e => setManualForm(f => ({ ...f, givenName: e.target.value }))} />
              </div>
              <div className="manual-edit-field">
                <label htmlFor="manual-surname">שם משפחה</label>
                <input id="manual-surname" value={manualForm.surname} onChange={e => setManualForm(f => ({ ...f, surname: e.target.value }))} />
              </div>
              <div className="manual-edit-field">
                <label htmlFor="manual-sex">מין</label>
                <select id="manual-sex" value={manualForm.sex} onChange={e => setManualForm(f => ({ ...f, sex: e.target.value }))}>
                  <option value="U">לא ידוע</option>
                  <option value="F">נקבה</option>
                  <option value="M">זכר</option>
                </select>
              </div>
              <div className="manual-edit-field">
                <label htmlFor="manual-occu">עיסוק</label>
                <input id="manual-occu" value={manualForm.occupation} onChange={e => setManualForm(f => ({ ...f, occupation: e.target.value }))} />
              </div>
              <div className="manual-edit-field">
                <label htmlFor="manual-bdate">תאריך לידה</label>
                <input id="manual-bdate" placeholder="לדוגמה: 15/05/1920 או 1920" value={manualForm.birthDate} onChange={e => setManualForm(f => ({ ...f, birthDate: e.target.value }))} />
              </div>
              <div className="manual-edit-field">
                <label htmlFor="manual-bplace">מקום לידה</label>
                <input id="manual-bplace" value={manualForm.birthPlace} onChange={e => setManualForm(f => ({ ...f, birthPlace: e.target.value }))} />
              </div>
              <div className="manual-edit-field">
                <label htmlFor="manual-ddate">תאריך פטירה</label>
                <input id="manual-ddate" placeholder="לדוגמה: 1985" value={manualForm.deathDate} onChange={e => setManualForm(f => ({ ...f, deathDate: e.target.value }))} />
              </div>
              <div className="manual-edit-field">
                <label htmlFor="manual-dplace">מקום פטירה</label>
                <input id="manual-dplace" value={manualForm.deathPlace} onChange={e => setManualForm(f => ({ ...f, deathPlace: e.target.value }))} />
              </div>
              <div className="manual-edit-field">
                <label htmlFor="manual-dcause">סיבת פטירה (CAUS)</label>
                <input id="manual-dcause" value={manualForm.deathCause} onChange={e => setManualForm(f => ({ ...f, deathCause: e.target.value }))} />
              </div>
              <div className="manual-edit-field">
                <label htmlFor="manual-resi">מקום מגורים</label>
                <input id="manual-resi" value={manualForm.residencePlace} onChange={e => setManualForm(f => ({ ...f, residencePlace: e.target.value }))} />
              </div>
              <div className="manual-edit-field">
                <label htmlFor="manual-title">תואר (הרב / ד״ר / ...)</label>
                <input id="manual-title" value={manualForm.title} onChange={e => setManualForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="manual-edit-field">
                <label htmlFor="manual-source">מקור המידע (אופציונלי)</label>
                <input id="manual-source" placeholder="לדוגמה: ספר זיכרון משפחתי" value={manualForm.source} onChange={e => setManualForm(f => ({ ...f, source: e.target.value }))} />
              </div>
              <div className="manual-edit-field full-span">
                <label htmlFor="manual-note">הוספת הערה חדשה (אופציונלי)</label>
                <textarea id="manual-note" rows={2} placeholder="פרט נוסף או זיכרון להוספה לרשומה..." value={manualForm.note} onChange={e => setManualForm(f => ({ ...f, note: e.target.value }))} />
              </div>
            </div>

            <div className="extra-tags-section">
              <div className="extra-tags-header">
                <strong>תגיות ואירועי GEDCOM נוספות</strong>
                <button type="button" className="button button-white button-small" onClick={addExtraTagRow}>
                  <Plus size={14} />
                  <span>הוספת תגית / אירוע GEDCOM</span>
                </button>
              </div>
              {extraTags.length > 0 && (
                <div className="extra-tags-list">
                  {extraTags.map((row, idx) => {
                    const opt = findTagOption(row.optionKey);
                    return (
                      <div key={row.id} className="extra-tag-card">
                        <div className="extra-tag-top">
                          <select
                            aria-label={`סוג תגית GEDCOM #${idx + 1}`}
                            value={row.optionKey}
                            onChange={e => {
                              const nextKey = e.target.value;
                              setExtraTags(prev => prev.map((it, i) => (i === idx ? { ...it, optionKey: nextKey } : it)));
                            }}
                          >
                            {visibleTagGroups.map(group => (
                              <optgroup key={group.id} label={group.label}>
                                {group.options.map(o => (
                                  <option key={o.key} value={o.key}>{o.label}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="הסרת תגית"
                            onClick={() => setExtraTags(prev => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <div className="extra-tag-fields">
                          {opt.kind === 'custom' && (
                            <input
                              type="text"
                              dir="ltr"
                              placeholder="קוד תגית (לדוגמה _YART)"
                              value={row.customTag}
                              onChange={e => setExtraTags(prev => prev.map((it, i) => (i === idx ? { ...it, customTag: e.target.value } : it)))}
                            />
                          )}
                          {opt.kind === 'familyEvent' && spouseFamilyOptions.length > 0 && (
                            <select
                              aria-label="משפחה מקושרת"
                              value={row.familyId}
                              onChange={e => setExtraTags(prev => prev.map((it, i) => (i === idx ? { ...it, familyId: e.target.value } : it)))}
                              className="full-span"
                            >
                              {spouseFamilyOptions.map(sf => (
                                <option key={sf.id} value={sf.id}>{sf.label}</option>
                              ))}
                            </select>
                          )}
                          {opt.supportsType && (
                            <input
                              type="text"
                              placeholder="תיאור סוג (TYPE)"
                              value={row.type}
                              onChange={e => setExtraTags(prev => prev.map((it, i) => (i === idx ? { ...it, type: e.target.value } : it)))}
                            />
                          )}
                          {(opt.kind === 'scalar' || opt.kind === 'attribute' || opt.kind === 'custom') && (
                            opt.tag === 'ADDR' ? (
                              <textarea
                                rows={2}
                                className="full-span"
                                placeholder="כתובת מלאה..."
                                value={row.value}
                                onChange={e => setExtraTags(prev => prev.map((it, i) => (i === idx ? { ...it, value: e.target.value } : it)))}
                              />
                            ) : (
                              <input
                                type="text"
                                className={opt.kind === 'scalar' ? 'full-span' : ''}
                                placeholder="ערך (Value)"
                                value={row.value}
                                onChange={e => setExtraTags(prev => prev.map((it, i) => (i === idx ? { ...it, value: e.target.value } : it)))}
                              />
                            )
                          )}
                          {opt.kind !== 'scalar' && (
                            <>
                              <input
                                type="text"
                                placeholder="תאריך (DATE)"
                                value={row.date}
                                onChange={e => setExtraTags(prev => prev.map((it, i) => (i === idx ? { ...it, date: e.target.value } : it)))}
                              />
                              <input
                                type="text"
                                placeholder="מקום (PLAC)"
                                value={row.place}
                                onChange={e => setExtraTags(prev => prev.map((it, i) => (i === idx ? { ...it, place: e.target.value } : it)))}
                              />
                            </>
                          )}
                          {(opt.kind === 'event' || opt.kind === 'familyEvent') && (
                            <input
                              type="text"
                              className="full-span"
                              placeholder="פירוט נוסף (אופציונלי)"
                              value={row.detail}
                              onChange={e => setExtraTags(prev => prev.map((it, i) => (i === idx ? { ...it, detail: e.target.value } : it)))}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {error && (
              <div className="error-message" role="alert" style={{ marginBottom: 12 }}>
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="button button-white" onClick={onClose} style={{ minHeight: 40 }}>ביטול</button>
              <button type="submit" className="button button-primary" style={{ minHeight: 40 }}>
                <Check size={17} />
                <span>שמירת שינויים</span>
              </button>
            </div>
          </form>
        ) : mode === 'family' ? (
          <form onSubmit={handleAddFamilySubmit}>
            <div className="manual-edit-grid" style={{ marginBottom: 10 }}>
              <div className="manual-edit-field full-span">
                <label htmlFor="family-relation-select">קשר משפחתי ביחס אל {person.given || person.name}</label>
                <select
                  id="family-relation-select"
                  value={familyForm.relation}
                  onChange={e => {
                    const nextRel = e.target.value;
                    setFamilyForm(f => ({
                      ...f,
                      relation: nextRel,
                      sex: inferSexFromRelation(nextRel),
                      targetFamilyId: '',
                      halfParentId: '',
                    }));
                  }}
                >
                  {Object.entries(RELATION_LABELS_HE).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="relative-mode-toggle" role="group" aria-label="אופן הוספת בן המשפחה">
              <button
                type="button"
                className={familyForm.linkMode === 'new' ? 'selected' : ''}
                onClick={() => setFamilyForm(f => ({ ...f, linkMode: 'new', existingPersonId: '' }))}
              >
                יצירת אדם חדש
              </button>
              <button
                type="button"
                className={familyForm.linkMode === 'existing' ? 'selected' : ''}
                onClick={() => setFamilyForm(f => ({ ...f, linkMode: 'existing' }))}
              >
                קישור אדם קיים באילן
              </button>
            </div>

            {familyForm.linkMode === 'existing' ? (
              <div className="existing-person-picker">
                <label htmlFor="existing-person-search" style={{ fontSize: 11, fontWeight: 600, color: '#3d533d' }}>
                  חיפוש ובחירת אדם קיים:
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="existing-person-search"
                    type="search"
                    placeholder="הקלד שם לחיפוש באילן..."
                    value={familyForm.existingSearch}
                    onChange={e => setFamilyForm(f => ({ ...f, existingSearch: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd7c4', fontSize: 13 }}
                  />
                </div>
                <div className="existing-person-list" role="listbox" aria-label="תוצאות אנשים קיימים">
                  {existingPeopleMatches.length ? existingPeopleMatches.map(candidate => (
                    <button
                      type="button"
                      key={candidate.id}
                      role="option"
                      aria-selected={familyForm.existingPersonId === candidate.id}
                      className={`existing-person-option ${familyForm.existingPersonId === candidate.id ? 'selected' : ''}`}
                      onClick={() => setFamilyForm(f => ({ ...f, existingPersonId: candidate.id }))}
                    >
                      <span dir="auto">{candidate.name}</span>
                      <small>{lifeLabel(candidate)}</small>
                    </button>
                  )) : (
                    <div style={{ padding: 10, fontSize: 12, color: '#6b7862', textAlign: 'center' }}>
                      לא נמצאו אנשים מתאימים באילן.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="manual-edit-grid">
                <div className="manual-edit-field">
                  <label htmlFor="fam-given">שם פרטי</label>
                  <input id="fam-given" value={familyForm.givenName} onChange={e => setFamilyForm(f => ({ ...f, givenName: e.target.value }))} />
                </div>
                <div className="manual-edit-field">
                  <label htmlFor="fam-surname">שם משפחה</label>
                  <input id="fam-surname" value={familyForm.surname} onChange={e => setFamilyForm(f => ({ ...f, surname: e.target.value }))} />
                </div>
                <div className="manual-edit-field">
                  <label htmlFor="fam-sex">מין</label>
                  <select id="fam-sex" value={familyForm.sex} onChange={e => setFamilyForm(f => ({ ...f, sex: e.target.value }))}>
                    <option value="U">לא ידוע</option>
                    <option value="F">נקבה</option>
                    <option value="M">זכר</option>
                  </select>
                </div>
                <div className="manual-edit-field">
                  <label htmlFor="fam-occu">עיסוק (אופציונלי)</label>
                  <input id="fam-occu" value={familyForm.occupation} onChange={e => setFamilyForm(f => ({ ...f, occupation: e.target.value }))} />
                </div>
                <div className="manual-edit-field">
                  <label htmlFor="fam-bdate">תאריך לידה</label>
                  <input id="fam-bdate" placeholder="1950 או 15/05/1950" value={familyForm.birthDate} onChange={e => setFamilyForm(f => ({ ...f, birthDate: e.target.value }))} />
                </div>
                <div className="manual-edit-field">
                  <label htmlFor="fam-bplace">מקום לידה</label>
                  <input id="fam-bplace" value={familyForm.birthPlace} onChange={e => setFamilyForm(f => ({ ...f, birthPlace: e.target.value }))} />
                </div>
                <div className="manual-edit-field">
                  <label htmlFor="fam-ddate">תאריך פטירה (אופציונלי)</label>
                  <input id="fam-ddate" value={familyForm.deathDate} onChange={e => setFamilyForm(f => ({ ...f, deathDate: e.target.value }))} />
                </div>
                <div className="manual-edit-field">
                  <label htmlFor="fam-dplace">מקום פטירה (אופציונלי)</label>
                  <input id="fam-dplace" value={familyForm.deathPlace} onChange={e => setFamilyForm(f => ({ ...f, deathPlace: e.target.value }))} />
                </div>
                <div className="manual-edit-field full-span">
                  <label htmlFor="fam-note">הערה (אופציונלי)</label>
                  <input id="fam-note" value={familyForm.note} onChange={e => setFamilyForm(f => ({ ...f, note: e.target.value }))} />
                </div>
              </div>
            )}

            {/* Contextual Relationship Options */}
            <div className="manual-edit-grid">
              {familyCategory === 'child' && spouseFamilyOptions.length > 0 && (
                <div className="manual-edit-field full-span">
                  <label htmlFor="fam-other-parent">הורה נוסף / משפחה</label>
                  <select
                    id="fam-other-parent"
                    value={familyForm.targetFamilyId}
                    onChange={e => setFamilyForm(f => ({ ...f, targetFamilyId: e.target.value }))}
                  >
                    <option value="">בחירה אוטומטית ({spouseFamilyOptions[0].label})</option>
                    {spouseFamilyOptions.map(sf => (
                      <option key={sf.id} value={sf.id}>{sf.label}</option>
                    ))}
                    <option value="__new_single__">ללא בן/בת זוג (הורה יחיד)</option>
                  </select>
                </div>
              )}

              {(familyCategory === 'parent' || familyCategory === 'child') && (
                <div className="manual-edit-field">
                  <label htmlFor="fam-pedigree">סוג קשר הורי (PEDI)</label>
                  <select
                    id="fam-pedigree"
                    value={familyForm.pedigree}
                    onChange={e => setFamilyForm(f => ({ ...f, pedigree: e.target.value }))}
                  >
                    {PEDIGREE_TYPES.map(pt => (
                      <option key={pt} value={pt}>{PEDIGREE_LABELS[pt] || pt}</option>
                    ))}
                  </select>
                </div>
              )}

              {familyCategory === 'parent' && relations.parentFamilies?.length > 1 && (
                <div className="manual-edit-field">
                  <label htmlFor="fam-parent-family">שיוך למשפחת הורים</label>
                  <select
                    id="fam-parent-family"
                    value={familyForm.targetFamilyId}
                    onChange={e => setFamilyForm(f => ({ ...f, targetFamilyId: e.target.value }))}
                  >
                    <option value="">אוטומטי</option>
                    {relations.parentFamilies.map(pf => (
                      <option key={pf.id} value={pf.id}>
                        {PEDIGREE_LABELS[pf.type] || pf.type} ({pf.id.replaceAll('@', '')})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {familyCategory === 'sibling' && relations.parents.length >= 2 && (
                <div className="manual-edit-field full-span">
                  <label htmlFor="fam-half-parent">הורים משותפים</label>
                  <select
                    id="fam-half-parent"
                    value={familyForm.halfParentId}
                    onChange={e => setFamilyForm(f => ({ ...f, halfParentId: e.target.value }))}
                  >
                    <option value="">שני ההורים (אח/ות מלא/ה)</option>
                    {relations.parents.map(par => (
                      <option key={par.id} value={par.id}>רק דרך {par.name} (אח/ות למחצה)</option>
                    ))}
                  </select>
                </div>
              )}

              {familyCategory === 'spouse' && (
                <>
                  <div className="manual-edit-field">
                    <label htmlFor="fam-marr-date">תאריך נישואים (MARR)</label>
                    <input id="fam-marr-date" placeholder="אופציונלי" value={familyForm.marriageDate} onChange={e => setFamilyForm(f => ({ ...f, marriageDate: e.target.value }))} />
                  </div>
                  <div className="manual-edit-field">
                    <label htmlFor="fam-marr-place">מקום נישואים</label>
                    <input id="fam-marr-place" placeholder="אופציונלי" value={familyForm.marriagePlace} onChange={e => setFamilyForm(f => ({ ...f, marriagePlace: e.target.value }))} />
                  </div>
                  <div className="manual-edit-field">
                    <label htmlFor="fam-enga-date">תאריך אירוסים (ENGA)</label>
                    <input id="fam-enga-date" placeholder="אופציונלי" value={familyForm.engagementDate} onChange={e => setFamilyForm(f => ({ ...f, engagementDate: e.target.value }))} />
                  </div>
                  <div className="manual-edit-field">
                    <label htmlFor="fam-div-date">תאריך גירושים (DIV)</label>
                    <input id="fam-div-date" placeholder="אופציונלי" value={familyForm.divorceDate} onChange={e => setFamilyForm(f => ({ ...f, divorceDate: e.target.value }))} />
                  </div>
                  {singlePartnerChildFamily && (
                    <div className="manual-edit-field full-span">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={familyForm.attachToExistingFamily}
                          onChange={e => setFamilyForm(f => ({ ...f, attachToExistingFamily: e.target.checked }))}
                        />
                        <span>שייך גם למשפחה הקיימת עם הילדים ({singlePartnerChildFamily.children.length} ילדים)</span>
                      </label>
                    </div>
                  )}
                </>
              )}
            </div>

            {error && (
              <div className="error-message" role="alert" style={{ marginBottom: 12 }}>
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="button button-white" onClick={onClose} style={{ minHeight: 40 }}>ביטול</button>
              <button type="submit" className="button button-primary" style={{ minHeight: 40 }}>
                <UserPlus size={17} />
                <span>הוספה לאילן</span>
              </button>
            </div>
          </form>
        ) : (
        <>
        {configNotice && (
          <div className="ai-config-notice" role="status">
            <Check size={14} />
            <span>{configNotice}</span>
          </div>
        )}

        {/* Collapsible AI Settings: hidden completely once configured until user clicks הגדרות AI */}
        {showKeyInput && (
          <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
              padding: '7px 12px',
              background: '#f4f7ee',
              borderRadius: 8,
              border: '1px solid #e2ebd7',
              marginBottom: 10,
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={14} color="#557545" />
              <span style={{ color: '#3a5030', fontWeight: 600 }}>
                {activeProvider?.label || 'מנוע AI'}
              </span>
              {activeProvider?.badge && (
                <span
                  style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: activeProvider.hasKey ? '#e2f2da' : '#edf2ea',
                    color: activeProvider.hasKey ? '#275e1f' : '#576750',
                    fontWeight: 500,
                  }}
                >
                  {activeProvider.badge}
                </span>
              )}
            </div>

            {aiConfigured && (
              <button
                type="button"
                onClick={() => setShowKeyInput(false)}
                disabled={busy}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  color: '#46673a',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                <span>הסתר הגדרות</span>
              </button>
            )}
          </div>

          <div
            style={{
              padding: '12px 14px',
              background: '#fcfbf8',
              border: '1px solid #ebdccb',
              borderRadius: 10,
              marginBottom: 14,
              fontSize: 12,
            }}
          >
            <div
              role="tablist"
              aria-label="ספק API"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 6,
                padding: 3,
                borderRadius: 8,
                background: '#f2ece2',
                marginBottom: 10,
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={keyTab === 'openrouter'}
                disabled={busy || testingKey}
                onClick={() => { setKeyTab('openrouter'); setKeyStatus(null); }}
                style={{
                  minHeight: 32,
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  background: keyTab === 'openrouter' ? '#fff' : 'transparent',
                  color: keyTab === 'openrouter' ? '#2c472b' : '#6f6253',
                  boxShadow: keyTab === 'openrouter' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                OpenRouter{openRouterKey.trim() ? ' ✓' : ''}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={keyTab === 'gemini'}
                disabled={busy || testingKey}
                onClick={() => { setKeyTab('gemini'); setKeyStatus(null); }}
                style={{
                  minHeight: 32,
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  background: keyTab === 'gemini' ? '#fff' : 'transparent',
                  color: keyTab === 'gemini' ? '#2c472b' : '#6f6253',
                  boxShadow: keyTab === 'gemini' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                Google Gemini{apiKey.trim() ? ' ✓' : ''}
              </button>
            </div>

            {keyTab === 'openrouter' ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                  }}
                >
                  <strong style={{ color: '#7a4e28', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Key size={14} />
                    <span>מפתח OpenRouter (עובד עם Gemini, GPT, Claude ומודלים חינמיים)</span>
                  </strong>
                </div>

                <p style={{ color: '#685949', fontSize: 11, lineHeight: 1.5, margin: '4px 0 8px' }}>
                  הזן מפתח OpenRouter ובחר מודל. הבקשות נשלחות ישירות מהדפדפן אל OpenRouter והמפתח נשמר במכשירך בלבד.
                </p>

                <div style={{ marginBottom: 8 }}>
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      color: '#904e1c',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    <span>יצירת מפתח API ב-openrouter.ai</span>
                    <ExternalLink size={11} />
                  </a>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleTestOpenRouterKey();
                  }}
                  autoComplete="off"
                >
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: '1 1 180px' }}>
                      <input
                        type={showKeyText ? 'text' : 'password'}
                        name="openrouter-api-key"
                        aria-label="מפתח OpenRouter API"
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={openRouterKey}
                        onChange={(e) => setOpenRouterKey(e.target.value)}
                        placeholder="הדבק מפתח כאן: sk-or-v1-..."
                        dir="ltr"
                        disabled={busy || testingKey}
                        style={{
                          width: '100%',
                          padding: '7px 32px 7px 10px',
                          borderRadius: 6,
                          border: '1px solid #cfc2b2',
                          fontSize: 12,
                          fontFamily: 'monospace',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKeyText((v) => !v)}
                        style={{
                          position: 'absolute',
                          right: 6,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: '#8b7c6c',
                          padding: 2,
                        }}
                        aria-label={showKeyText ? 'הסתר מפתח' : 'הצג מפתח'}
                      >
                        {showKeyText ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>

                    <button
                      type="button"
                      className="button button-white button-small"
                      onClick={handleTestOpenRouterKey}
                      disabled={busy || testingKey || !openRouterKey.trim()}
                      style={{ padding: '4px 9px', fontSize: 11 }}
                    >
                      {testingKey ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />}
                      <span>בדיקה</span>
                    </button>

                    <button
                      type="button"
                      className="button button-primary button-small"
                      onClick={handleSaveOpenRouterKey}
                      disabled={busy || testingKey}
                      style={{ padding: '4px 10px', fontSize: 11 }}
                    >
                      שמור
                    </button>

                    {openRouterKey && (
                      <button
                        type="button"
                        className="button button-white button-small"
                        onClick={handleRemoveOpenRouterKey}
                        disabled={busy || testingKey}
                        title="מחק מפתח"
                        style={{ padding: '4px 8px', fontSize: 11, color: '#973d2a' }}
                      >
                        הסר
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
                    <label
                      htmlFor="openrouter-model-select"
                      style={{ fontSize: 11, fontWeight: 600, color: '#5c5042' }}
                    >
                      מודל ב-OpenRouter:
                    </label>
                    <select
                      id="openrouter-model-select"
                      value={customModelMode ? '__custom__' : openRouterModel}
                      disabled={busy || testingKey}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__custom__') {
                          setCustomModelMode(true);
                        } else {
                          setCustomModelMode(false);
                          setOpenRouterModel(val);
                          saveOpenRouterModel(val);
                          if (openRouterKey.trim()) {
                            refreshProvider();
                          }
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: 6,
                        border: '1px solid #cfc2b2',
                        background: '#fff',
                        fontSize: 12,
                        color: '#2f3d32',
                      }}
                    >
                      {OPENROUTER_PRESET_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                      <option value="__custom__">מודל מותאם אישית…</option>
                    </select>
                    {customModelMode && (
                      <input
                        type="text"
                        aria-label="מזהה מודל OpenRouter מותאם אישית"
                        dir="ltr"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={openRouterModel}
                        onChange={(e) => setOpenRouterModel(e.target.value)}
                        placeholder="לדוגמה: google/gemini-2.5-flash"
                        disabled={busy || testingKey}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: 6,
                          border: '1px solid #cfc2b2',
                          fontSize: 12,
                          fontFamily: 'monospace',
                        }}
                      />
                    )}
                  </div>
                </form>
              </>
            ) : (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                  }}
                >
                  <strong style={{ color: '#7a4e28', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Key size={14} />
                    <span>מפתח Google Gemini (מומלץ לנייד, Safari ו-Firefox)</span>
                  </strong>
                </div>

                <p style={{ color: '#685949', fontSize: 11, lineHeight: 1.5, margin: '4px 0 8px' }}>
                  חינמי, מהיר (<span dir="ltr">1-2</span> שניות), איכותי ביותר בעברית וללא הורדת קובץ מודל כבד. המפתח נשמר במכשירך בלבד.
                </p>

                <div style={{ marginBottom: 8 }}>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      color: '#904e1c',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    <span>קבלת מפתח חינם ב-Google AI Studio (ללא צורך באשראי)</span>
                    <ExternalLink size={11} />
                  </a>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleTestKey();
                  }}
                  autoComplete="off"
                  style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}
                >
                  <div style={{ position: 'relative', flex: '1 1 180px' }}>
                    <input
                      type={showKeyText ? 'text' : 'password'}
                      name="gemini-api-key"
                      aria-label="מפתח Google Gemini API"
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="הדבק מפתח כאן: AIzaSy..."
                      dir="ltr"
                      disabled={busy || testingKey}
                      style={{
                        width: '100%',
                        padding: '7px 32px 7px 10px',
                        borderRadius: 6,
                        border: '1px solid #cfc2b2',
                        fontSize: 12,
                        fontFamily: 'monospace',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeyText((v) => !v)}
                      style={{
                        position: 'absolute',
                        right: 6,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#8b7c6c',
                        padding: 2,
                      }}
                      aria-label={showKeyText ? 'הסתר מפתח' : 'הצג מפתח'}
                    >
                      {showKeyText ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>

                  <button
                    type="button"
                    className="button button-white button-small"
                    onClick={handleTestKey}
                    disabled={busy || testingKey || !apiKey.trim()}
                    style={{ padding: '4px 9px', fontSize: 11 }}
                  >
                    {testingKey ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />}
                    <span>בדיקה</span>
                  </button>

                  <button
                    type="button"
                    className="button button-primary button-small"
                    onClick={handleSaveKey}
                    disabled={busy || testingKey}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                  >
                    שמור
                  </button>

                  {apiKey && (
                    <button
                      type="button"
                      className="button button-white button-small"
                      onClick={handleRemoveKey}
                      disabled={busy || testingKey}
                      title="מחק מפתח"
                      style={{ padding: '4px 8px', fontSize: 11, color: '#973d2a' }}
                    >
                      הסר
                    </button>
                  )}
                </form>
              </>
            )}

            {keyStatus && (
              <div
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  borderRadius: 5,
                  background:
                    keyStatus.type === 'success'
                      ? '#edf6eb'
                      : keyStatus.type === 'error'
                      ? '#fdf0ee'
                      : '#f4f4f4',
                  color:
                    keyStatus.type === 'success'
                      ? '#2b691f'
                      : keyStatus.type === 'error'
                      ? '#a03120'
                      : '#555',
                  marginTop: 4,
                }}
              >
                {keyStatus.message}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                flexWrap: 'wrap',
                marginTop: 10,
                paddingTop: 10,
                borderTop: '1px solid #eadfd2',
              }}
            >
              <button
                type="button"
                className="button button-white button-small"
                onClick={handleUseLocalAiDefault}
                disabled={busy || testingKey}
                style={{ fontSize: 11, padding: '4px 9px' }}
              >
                השתמש ב-AI מקומי (ללא מפתח) כברירת מחדל
              </button>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  color: '#445a40',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={devMode}
                  onChange={(e) => setDevMode(e.target.checked)}
                  disabled={busy}
                />
                <Bug size={13} />
                <span>מצב מפתח (הצגת JSON ו-Diff)</span>
              </label>
            </div>
          </div>
          </>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <div className="ai-compact-header">
              <label
                htmlFor="ai-input-text"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#324738',
                }}
              >
                טקסט חופשי לעדכון:
              </label>
              <button
                type="button"
                className="ai-settings-toggle"
                onClick={() => setShowKeyInput(v => !v)}
                aria-expanded={showKeyInput}
                disabled={busy}
                title={activeProvider?.label || 'הגדרות AI'}
              >
                <Settings size={13} />
                <span>{showKeyInput ? 'הסתר הגדרות AI' : 'הגדרות AI'}</span>
              </button>
            </div>
            <textarea
              id="ai-input-text"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="לדוגמה: נולד ב-1920 בוורשה, התחתן עם שרה לוי ב-1949 בתל אביב, ונולדו להם בן דני ב-1952."
              disabled={busy}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #c9d5c4',
                fontSize: 16,
                lineHeight: 1.6,
                fontFamily: 'inherit',
                resize: 'vertical',
                minHeight: 90,
                touchAction: 'manipulation',
              }}
              autoFocus={typeof window !== 'undefined' && window.innerWidth > 600}
            />
            <span style={{ fontSize: 11, color: '#687b5a', display: 'block', marginTop: 4 }}>
              ה-AI ינתח את הטקסט, יציג תצוגה מקדימה לאישור (כולל הוספת בני משפחה ותגיות GEDCOM), ויעדכן את האילן רק לאחר אישורך.
            </span>
          </div>

          {pendingUpdate && (
            <div
              className="ai-diff-preview"
              role="region"
              aria-label="תצוגה מקדימה של השינויים"
            >
              <strong className="ai-diff-heading">
                תצוגה מקדימה — ניתן לבחור או לתקן כל שדה לפני השמירה:
              </strong>
              <div className="ai-diff-list">
                {(pendingUpdate.items || []).map((item, idx) => (
                  <div key={item.field} className={`ai-diff-row ${item.checked ? '' : 'is-unchecked'}`}>
                    <label className="ai-diff-check">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setPendingUpdate((prev) => ({
                            ...prev,
                            items: prev.items.map((it, i) => (i === idx ? { ...it, checked } : it)),
                          }));
                        }}
                      />
                      <span>{FIELD_LABELS[item.field] || item.field}</span>
                      {formatDiffValue(item.old) !== '—' && (
                        <small className="ai-diff-old">{formatDiffValue(item.old)}</small>
                      )}
                    </label>
                    {item.field === 'sex' ? (
                      <select
                        aria-label={FIELD_LABELS[item.field] || item.field}
                        value={item.value}
                        disabled={!item.checked}
                        onChange={(e) => {
                          const value = e.target.value;
                          setPendingUpdate((prev) => ({
                            ...prev,
                            items: prev.items.map((it, i) => (i === idx ? { ...it, value } : it)),
                          }));
                        }}
                      >
                        <option value="U">לא ידוע (U)</option>
                        <option value="M">זכר (M)</option>
                        <option value="F">נקבה (F)</option>
                      </select>
                    ) : item.isArray ? (
                      <textarea
                        rows={2}
                        aria-label={FIELD_LABELS[item.field] || item.field}
                        value={item.value}
                        disabled={!item.checked}
                        onChange={(e) => {
                          const value = e.target.value;
                          setPendingUpdate((prev) => ({
                            ...prev,
                            items: prev.items.map((it, i) => (i === idx ? { ...it, value } : it)),
                          }));
                        }}
                      />
                    ) : (
                      <input
                        type="text"
                        aria-label={FIELD_LABELS[item.field] || item.field}
                        value={item.value}
                        disabled={!item.checked}
                        onChange={(e) => {
                          const value = e.target.value;
                          setPendingUpdate((prev) => ({
                            ...prev,
                            items: prev.items.map((it, i) => (i === idx ? { ...it, value } : it)),
                          }));
                        }}
                      />
                    )}
                  </div>
                ))}

                {(pendingUpdate.structuredTags || []).map((tagItem, idx) => (
                  <div key={tagItem.key} className={`ai-tag-preview-card ${tagItem.checked ? '' : 'is-unchecked'}`}>
                    <label className="ai-diff-check">
                      <input
                        type="checkbox"
                        checked={tagItem.checked}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setPendingUpdate(prev => ({
                            ...prev,
                            structuredTags: prev.structuredTags.map((t, i) => (i === idx ? { ...t, checked } : t)),
                          }));
                        }}
                      />
                      <span>
                        {tagItem.kind === 'familyEvent' ? 'אירוע משפחתי: ' : 'תגית GEDCOM: '}
                        {EVENT_NAMES[tagItem.tag] || ATTRIBUTE_NAMES[tagItem.tag] || tagItem.tag} ({tagItem.tag})
                      </span>
                    </label>
                    <div className="ai-relative-grid">
                      {tagItem.type !== undefined && (
                        <input
                          type="text"
                          placeholder="תיאור סוג (TYPE)"
                          disabled={!tagItem.checked}
                          value={tagItem.type || ''}
                          onChange={e => setPendingUpdate(prev => ({
                            ...prev,
                            structuredTags: prev.structuredTags.map((t, i) => (i === idx ? { ...t, type: e.target.value } : t)),
                          }))}
                        />
                      )}
                      {tagItem.value !== undefined && (
                        <input
                          type="text"
                          placeholder="ערך"
                          disabled={!tagItem.checked}
                          value={tagItem.value || ''}
                          onChange={e => setPendingUpdate(prev => ({
                            ...prev,
                            structuredTags: prev.structuredTags.map((t, i) => (i === idx ? { ...t, value: e.target.value } : t)),
                          }))}
                        />
                      )}
                      {tagItem.date !== undefined && (
                        <input
                          type="text"
                          placeholder="תאריך"
                          disabled={!tagItem.checked}
                          value={tagItem.date || ''}
                          onChange={e => setPendingUpdate(prev => ({
                            ...prev,
                            structuredTags: prev.structuredTags.map((t, i) => (i === idx ? { ...t, date: e.target.value } : t)),
                          }))}
                        />
                      )}
                      {tagItem.place !== undefined && (
                        <input
                          type="text"
                          placeholder="מקום"
                          disabled={!tagItem.checked}
                          value={tagItem.place || ''}
                          onChange={e => setPendingUpdate(prev => ({
                            ...prev,
                            structuredTags: prev.structuredTags.map((t, i) => (i === idx ? { ...t, place: e.target.value } : t)),
                          }))}
                        />
                      )}
                      {tagItem.detail !== undefined && (
                        <input
                          type="text"
                          placeholder="פירוט"
                          disabled={!tagItem.checked}
                          value={tagItem.detail || ''}
                          onChange={e => setPendingUpdate(prev => ({
                            ...prev,
                            structuredTags: prev.structuredTags.map((t, i) => (i === idx ? { ...t, detail: e.target.value } : t)),
                          }))}
                        />
                      )}
                      {tagItem.cause !== undefined && (
                        <input
                          type="text"
                          placeholder="סיבה (CAUS)"
                          disabled={!tagItem.checked}
                          value={tagItem.cause || ''}
                          onChange={e => setPendingUpdate(prev => ({
                            ...prev,
                            structuredTags: prev.structuredTags.map((t, i) => (i === idx ? { ...t, cause: e.target.value } : t)),
                          }))}
                        />
                      )}
                      {tagItem.agency !== undefined && (
                        <input
                          type="text"
                          placeholder="מוסד / סוכנות (AGNC)"
                          disabled={!tagItem.checked}
                          value={tagItem.agency || ''}
                          onChange={e => setPendingUpdate(prev => ({
                            ...prev,
                            structuredTags: prev.structuredTags.map((t, i) => (i === idx ? { ...t, agency: e.target.value } : t)),
                          }))}
                        />
                      )}
                      {tagItem.note !== undefined && (
                        <input
                          type="text"
                          placeholder="הערה (NOTE)"
                          disabled={!tagItem.checked}
                          value={tagItem.note || ''}
                          onChange={e => setPendingUpdate(prev => ({
                            ...prev,
                            structuredTags: prev.structuredTags.map((t, i) => (i === idx ? { ...t, note: e.target.value } : t)),
                          }))}
                        />
                      )}
                    </div>
                  </div>
                ))}

                {(pendingUpdate.relatives || []).map((rel, idx) => (
                  <div key={rel.key} className={`ai-relative-preview-card ${rel.checked ? '' : 'is-unchecked'}`}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <label className="ai-diff-check">
                        <input
                          type="checkbox"
                          checked={rel.checked}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setPendingUpdate(prev => ({
                              ...prev,
                              relatives: prev.relatives.map((r, i) => (i === idx ? { ...r, checked } : r)),
                            }));
                          }}
                        />
                        <Users size={14} />
                        <span>
                          {rel.existingPersonId
                            ? `קישור בן משפחה קיים (${rel.matchedPersonName || bundle.data?.people?.[rel.existingPersonId]?.name || rel.existingPersonId}): `
                            : 'הוספת בן משפחה: '}
                          {RELATION_LABELS_HE[rel.relation] || rel.relation}
                        </span>
                        {rel.matchedPersonName && !rel.existingPersonId && (
                          <small style={{ color: '#7a4e28', fontWeight: 500 }}>
                            (דומה ל־{rel.matchedPersonName} שכבר באילן)
                          </small>
                        )}
                      </label>
                      {rel.matchedPersonId && (
                        <button
                          type="button"
                          className="button button-white button-small"
                          style={{ fontSize: 11, padding: '2px 8px' }}
                          disabled={!rel.checked}
                          onClick={() => setPendingUpdate(prev => ({
                            ...prev,
                            relatives: prev.relatives.map((r, i) => (
                              i === idx ? { ...r, existingPersonId: r.existingPersonId ? '' : r.matchedPersonId } : r
                            )),
                          }))}
                        >
                          {rel.existingPersonId ? 'יצירת אדם חדש במקום קישור' : `קשר ל־${rel.matchedPersonName}`}
                        </button>
                      )}
                    </div>
                    <div className="ai-relative-grid">
                      <select
                        aria-label="סוג קרבה"
                        disabled={!rel.checked}
                        value={rel.relation}
                        onChange={e => setPendingUpdate(prev => ({
                          ...prev,
                          relatives: prev.relatives.map((r, i) => (i === idx ? { ...r, relation: e.target.value } : r)),
                        }))}
                      >
                        {Object.entries(RELATION_LABELS_HE).map(([k, label]) => (
                          <option key={k} value={k}>{label}</option>
                        ))}
                      </select>
                      <select
                        aria-label="מין בן המשפחה"
                        disabled={!rel.checked || Boolean(rel.existingPersonId)}
                        value={rel.sex}
                        onChange={e => setPendingUpdate(prev => ({
                          ...prev,
                          relatives: prev.relatives.map((r, i) => (i === idx ? { ...r, sex: e.target.value } : r)),
                        }))}
                      >
                        <option value="U">לא ידוע (U)</option>
                        <option value="M">זכר (M)</option>
                        <option value="F">נקבה (F)</option>
                      </select>
                      {!rel.existingPersonId && (
                        <>
                          <input
                            type="text"
                            placeholder="שם פרטי"
                            disabled={!rel.checked}
                            value={rel.givenName}
                            onChange={e => setPendingUpdate(prev => ({
                              ...prev,
                              relatives: prev.relatives.map((r, i) => (i === idx ? { ...r, givenName: e.target.value } : r)),
                            }))}
                          />
                          <input
                            type="text"
                            placeholder="שם משפחה"
                            disabled={!rel.checked}
                            value={rel.surname}
                            onChange={e => setPendingUpdate(prev => ({
                              ...prev,
                              relatives: prev.relatives.map((r, i) => (i === idx ? { ...r, surname: e.target.value } : r)),
                            }))}
                          />
                        </>
                      )}
                      {(rel.birthDate || rel.birthPlace) && (
                        <>
                          <input
                            type="text"
                            placeholder="תאריך לידה"
                            disabled={!rel.checked}
                            value={rel.birthDate}
                            onChange={e => setPendingUpdate(prev => ({
                              ...prev,
                              relatives: prev.relatives.map((r, i) => (i === idx ? { ...r, birthDate: e.target.value } : r)),
                            }))}
                          />
                          <input
                            type="text"
                            placeholder="מקום לידה"
                            disabled={!rel.checked}
                            value={rel.birthPlace}
                            onChange={e => setPendingUpdate(prev => ({
                              ...prev,
                              relatives: prev.relatives.map((r, i) => (i === idx ? { ...r, birthPlace: e.target.value } : r)),
                            }))}
                          />
                        </>
                      )}
                      {(rel.deathDate || rel.deathPlace) && (
                        <>
                          <input
                            type="text"
                            placeholder="תאריך פטירה"
                            disabled={!rel.checked}
                            value={rel.deathDate}
                            onChange={e => setPendingUpdate(prev => ({
                              ...prev,
                              relatives: prev.relatives.map((r, i) => (i === idx ? { ...r, deathDate: e.target.value } : r)),
                            }))}
                          />
                          <input
                            type="text"
                            placeholder="מקום פטירה"
                            disabled={!rel.checked}
                            value={rel.deathPlace}
                            onChange={e => setPendingUpdate(prev => ({
                              ...prev,
                              relatives: prev.relatives.map((r, i) => (i === idx ? { ...r, deathPlace: e.target.value } : r)),
                            }))}
                          />
                        </>
                      )}
                      {rel.occupation && (
                        <input
                          type="text"
                          placeholder="עיסוק"
                          disabled={!rel.checked}
                          value={rel.occupation}
                          onChange={e => setPendingUpdate(prev => ({
                            ...prev,
                            relatives: prev.relatives.map((r, i) => (i === idx ? { ...r, occupation: e.target.value } : r)),
                          }))}
                        />
                      )}
                      {(rel.marriageDate || rel.marriagePlace) && (
                        <>
                          <input
                            type="text"
                            placeholder="תאריך נישואים"
                            disabled={!rel.checked}
                            value={rel.marriageDate}
                            onChange={e => setPendingUpdate(prev => ({
                              ...prev,
                              relatives: prev.relatives.map((r, i) => (i === idx ? { ...r, marriageDate: e.target.value } : r)),
                            }))}
                          />
                          <input
                            type="text"
                            placeholder="מקום נישואים"
                            disabled={!rel.checked}
                            value={rel.marriagePlace}
                            onChange={e => setPendingUpdate(prev => ({
                              ...prev,
                              relatives: prev.relatives.map((r, i) => (i === idx ? { ...r, marriagePlace: e.target.value } : r)),
                            }))}
                          />
                        </>
                      )}
                      {(rel.engagementDate || rel.divorceDate) && (
                        <>
                          <input
                            type="text"
                            placeholder="תאריך אירוסים (ENGA)"
                            disabled={!rel.checked}
                            value={rel.engagementDate}
                            onChange={e => setPendingUpdate(prev => ({
                              ...prev,
                              relatives: prev.relatives.map((r, i) => (i === idx ? { ...r, engagementDate: e.target.value } : r)),
                            }))}
                          />
                          <input
                            type="text"
                            placeholder="תאריך גירושים (DIV)"
                            disabled={!rel.checked}
                            value={rel.divorceDate}
                            onChange={e => setPendingUpdate(prev => ({
                              ...prev,
                              relatives: prev.relatives.map((r, i) => (i === idx ? { ...r, divorceDate: e.target.value } : r)),
                            }))}
                          />
                        </>
                      )}
                      {relationCategory(rel.relation) === 'child' && spouseFamilyOptions.length > 1 && (
                        <select
                          aria-label="הורה נוסף"
                          disabled={!rel.checked}
                          value={rel.targetFamilyId}
                          onChange={e => setPendingUpdate(prev => ({
                            ...prev,
                            relatives: prev.relatives.map((r, i) => (i === idx ? { ...r, targetFamilyId: e.target.value } : r)),
                          }))}
                        >
                          <option value="">הורה נוסף אוטומטי</option>
                          {spouseFamilyOptions.map(sf => (
                            <option key={sf.id} value={sf.id}>{sf.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress Indicator when downloading local model or processing */}
          {busy && (
            <div
              style={{
                padding: '10px 14px',
                background: '#f4f8ef',
                border: '1px solid #dbe6d1',
                borderRadius: 8,
                marginBottom: 14,
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#395332' }}>
                <LoaderCircle className="spin" size={16} />
                <strong>
                  {['loading', 'initiate', 'download', 'progress'].includes(progressInfo?.status) && typeof progressInfo.progress === 'number'
                    ? `טוען מודל מקומי: ${progressInfo.progress}%`
                    : activeProvider?.id === 'openrouter'
                    ? 'מעבד נתונים בעזרת OpenRouter...'
                    : activeProvider?.id === 'gemini'
                    ? 'מעבד נתונים בעזרת Google Gemini...'
                    : activeProvider?.id === 'window.ai'
                    ? 'מעבד נתונים במודל המובנה של הדפדפן...'
                    : 'מעבד נתונים...'}
                </strong>
              </div>

              {['loading', 'initiate', 'download', 'progress'].includes(progressInfo?.status) && typeof progressInfo.progress === 'number' && (
                <div style={{ marginTop: 8 }}>
                  <div
                    style={{
                      height: 6,
                      background: '#dce5d3',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, Math.max(0, progressInfo.progress))}%`,
                        background: '#5a8247',
                        transition: 'width 0.2s ease',
                      }}
                    />
                  </div>
                  {progressInfo.file && (
                    <span
                      style={{
                        fontSize: 10,
                        color: '#6e8166',
                        display: 'block',
                        marginTop: 4,
                        direction: 'ltr',
                        textAlign: 'right',
                      }}
                    >
                      {progressInfo.file}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div
              className="error-message"
              role="alert"
              style={{
                marginBottom: 14,
                padding: '10px 12px',
                borderRadius: 8,
                background: '#fdf2f0',
                border: '1px solid #f2c7c1',
                color: '#93281c',
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ whiteSpace: 'pre-wrap' }}>{error}</div>
              </div>
              {!apiKey && !openRouterKey && !showKeyInput && (
                <div style={{ marginTop: 8, textAlign: 'left' }}>
                  <button
                    type="button"
                    onClick={() => setShowKeyInput(true)}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#904e1c',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                    }}
                  >
                    פתח הגדרות AI / הזן מפתח API ↗
                  </button>
                </div>
              )}
            </div>
          )}

          {devMode && debugInfo && (
            <div
              style={{
                marginBottom: 14,
                background: '#f3f6ee',
                border: '1px solid #d5e0cd',
                borderRadius: 8,
                padding: 10,
                fontSize: 11,
              }}
            >
              <strong style={{ display: 'block', marginBottom: 4, color: '#2c4230' }}>
                פלט AI ו-Diff (מצב מפתח):
              </strong>
              <div style={{ marginBottom: 6 }}>
                <strong>ספק בשימוש:</strong> {debugInfo.provider || 'default'}
              </div>
              <div style={{ marginBottom: 6 }}>
                <strong>סטטוס ולידציה:</strong> {debugInfo.valid ? 'תקין (Valid)' : 'שגיאה (Invalid)'}
              </div>
              {debugInfo.warnings?.length > 0 && (
                <div style={{ marginBottom: 6, color: '#8a5a00' }}>
                  {debugInfo.warnings.map((w) => (
                    <div key={w}>⚠ {w}</div>
                  ))}
                </div>
              )}
              {debugInfo.diff && (
                <div style={{ marginBottom: 6 }}>
                  <strong>שינויים (Diff):</strong>
                  <pre
                    style={{
                      margin: '4px 0',
                      padding: 6,
                      background: '#fff',
                      border: '1px solid #e0e7d8',
                      borderRadius: 6,
                      overflow: 'auto',
                      maxHeight: 120,
                    }}
                  >
                    {JSON.stringify(debugInfo.diff, null, 2)}
                  </pre>
                </div>
              )}
              {debugInfo.rawResponse && (
                <div>
                  <strong>תשובת AI גולמית:</strong>
                  <pre
                    style={{
                      margin: '4px 0',
                      padding: 6,
                      background: '#fff',
                      border: '1px solid #e0e7d8',
                      borderRadius: 6,
                      overflow: 'auto',
                      maxHeight: 100,
                    }}
                  >
                    {debugInfo.rawResponse}
                  </pre>
                </div>
              )}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 10,
              justifyContent: 'flex-end',
              marginTop: 16,
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              className="button button-white"
              onClick={pendingUpdate ? () => setPendingUpdate(null) : onClose}
              disabled={busy}
              style={{ minHeight: 40 }}
            >
              {pendingUpdate ? 'חזרה לעריכה' : 'ביטול'}
            </button>
            {pendingUpdate ? (
              <button
                type="button"
                className="button button-primary"
                onClick={handleConfirmPending}
                disabled={busy || !hasPendingChanges}
                style={{ minHeight: 40 }}
              >
                <Check size={17} />
                <span>אישור ועדכון באילן</span>
              </button>
            ) : (
              <button
                type="submit"
                className="button button-primary"
                disabled={!text.trim() || busy}
                style={{ minHeight: 40 }}
              >
                {busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}
                <span>{busy ? 'מעבד נתונים...' : 'בדיקה ותצוגה מקדימה'}</span>
              </button>
            )}
          </div>
        </form>
        </>
        )}
      </div>
    </div>,
    document.body
  );
}
