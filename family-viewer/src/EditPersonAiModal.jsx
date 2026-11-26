import React, { useState, useEffect } from 'react';
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
  ShieldCheck,
  Settings,
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
} from './ai-service.js';
import { applyPersonUpdatesToGedcom, validatePersonUpdates } from './gedcom-ai-editor.js';

const FIELD_LABELS = {
  givenName: 'שם פרטי',
  surname: 'שם משפחה',
  nickname: 'כינוי',
  alternateNames: 'שמות נוספים',
  sex: 'מין',
  birthDate: 'תאריך לידה',
  birthPlace: 'מקום לידה',
  deathDate: 'תאריך פטירה',
  deathPlace: 'מקום פטירה',
  deathCause: 'סיבת פטירה',
  burialDate: 'תאריך קבורה',
  burialPlace: 'מקום קבורה',
  cremationDate: 'תאריך שריפה',
  cremationPlace: 'מקום שריפה',
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
  graduationDate: 'תאריך סיום לימודים',
  graduationPlace: 'מקום סיום לימודים',
  retirementDate: 'תאריך פרישה',
  retirementPlace: 'מקום פרישה',
  occupation: 'עיסוק',
  education: 'השכלה',
  residencePlace: 'מקום מגורים',
  residenceDate: 'תאריך מגורים',
  title: 'תואר',
  religion: 'דת',
  nationality: 'לאום',
  description: 'תיאור',
  idNumber: 'מזהה / ת״ז',
  notes: 'הערות',
  source: 'מקור',
};

function formatDiffValue(val) {
  if (Array.isArray(val)) return val.join(' · ') || '—';
  const s = String(val ?? '').trim();
  return s || '—';
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
  const [mode, setMode] = useState('ai');
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);
  const [pendingUpdate, setPendingUpdate] = useState(null);
  const [activeProvider, setActiveProvider] = useState(null);
  const [progressInfo, setProgressInfo] = useState(null);

  // API Key management (OpenRouter + Gemini)
  const [keyTab, setKeyTab] = useState('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [openRouterModel, setOpenRouterModel] = useState(OPENROUTER_PRESET_MODELS[0].id);
  const [customModelMode, setCustomModelMode] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [showKeyText, setShowKeyText] = useState(false);
  const [keyStatus, setKeyStatus] = useState(null); // { type: 'success' | 'error' | 'info', message: string }
  const [testingKey, setTestingKey] = useState(false);

  useEffect(() => {
    if (isOpen) {
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

        // Automatically open key settings if no key and not on Chrome with window.ai
        if (!savedGeminiKey && !savedOrKey && provider.id === 'local') {
          setShowKeyInput(true);
        }
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

  const handleSaveKey = () => {
    setGeminiApiKey(apiKey);
    if (apiKey.trim()) setPreferredCloudProvider('gemini');
    refreshProvider();
    setKeyStatus({
      type: 'success',
      message: apiKey.trim() ? 'מפתח Gemini נשמר בהצלחה במכשיר זה.' : 'המפתח הוסר.',
    });
  };

  const handleRemoveKey = () => {
    setApiKey('');
    removeGeminiApiKey();
    refreshProvider();
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
    if (openRouterKey.trim()) setPreferredCloudProvider('openrouter');
    refreshProvider();
    setKeyStatus({
      type: 'success',
      message: openRouterKey.trim() ? 'מפתח OpenRouter והמודל נשמרו בהצלחה במכשיר זה.' : 'מפתח OpenRouter הוסר.',
    });
  };

  const handleRemoveOpenRouterKey = () => {
    setOpenRouterKey('');
    removeOpenRouterApiKey();
    refreshProvider();
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

      // Check if any fields were actually updated
      const hasChanges = result.sanitized && Object.keys(result.sanitized).length > 0;
      if (!hasChanges) {
        setError('לא זוהו שינויים או שדות חדשים לעדכון מתוך הטקסט שהוזן.');
        setBusy(false);
        return;
      }

      // Prepare editable diff preview items so user can uncheck or tweak any extracted field before saving
      const draftItems = Object.entries(result.diff).map(([field, change]) => ({
        field,
        old: change.old,
        value: Array.isArray(change.new) ? change.new.join('\n') : String(change.new ?? ''),
        isArray: Array.isArray(change.new),
        checked: true,
      }));

      setPendingUpdate({
        items: draftItems,
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
    if (!pendingUpdate?.items) return;
    const rawUpdates = {};
    for (const item of pendingUpdate.items) {
      if (!item.checked) continue;
      if (item.isArray) {
        const arr = item.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (arr.length) rawUpdates[item.field] = arr;
      } else {
        const val = item.value.trim();
        if (val) rawUpdates[item.field] = val;
      }
    }
    if (!Object.keys(rawUpdates).length) {
      setError('לא נבחרו שדות לעדכון.');
      return;
    }
    const validation = validatePersonUpdates(rawUpdates, {
      givenName: person.given,
      surname: person.surname,
      sex: person.sex,
      birthDate: person.birth?.date,
      birthPlace: person.birth?.place,
      deathDate: person.death?.date,
      deathPlace: person.death?.place,
      deathCause: person.death?.cause,
      occupation: person.occupation,
      notes: person.notes,
    });
    if (!validation.valid) {
      setError(validation.errors.join(' | '));
      return;
    }
    try {
      const updatedRaw = applyPersonUpdatesToGedcom(bundle.raw, person.id, validation.sanitized);
      onApplyUpdate({ updatedRaw, updates: validation.sanitized, diff: validation.diff });
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

    if (!Object.keys(rawUpdates).length) {
      setError('לא בוצעו שינויים בשדות.');
      return;
    }

    const validation = validatePersonUpdates(rawUpdates, {
      givenName: person.given,
      surname: person.surname,
      sex: person.sex,
      birthDate: person.birth?.date,
      birthPlace: person.birth?.place,
      deathDate: person.death?.date,
      deathPlace: person.death?.place,
      deathCause: person.death?.cause,
      occupation: person.occupation,
      residencePlace: currentResidence,
      title: currentTitle,
      notes: person.notes,
    });
    if (!validation.valid) {
      setError(validation.errors.join(' | '));
      return;
    }
    try {
      const updatedRaw = applyPersonUpdatesToGedcom(bundle.raw, person.id, validation.sanitized);
      onApplyUpdate({ updatedRaw, updates: validation.sanitized, diff: validation.diff });
      onClose();
    } catch (err) {
      setError(err.message || 'שגיאה בשמירת השינויים.');
    }
  };

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
          maxWidth: 540,
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
            <Pencil size={22} />
          </span>
          <h2 id="ai-edit-title">{mode === 'manual' ? 'עריכת פרטים ידנית' : 'עריכת פרטים באמצעות AI'}</h2>
          <p>
            עדכון נתונים עבור <strong dir="auto">{person.name}</strong>{' '}
            {mode === 'manual' ? '— עובד במכשיר בלבד, גם ללא חיבור לאינטרנט.' : 'על בסיס טקסט חופשי (עברית או אנגלית).'}
          </p>
        </div>

        <div className="edit-mode-tabs" role="tablist" aria-label="מצב עריכה">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'manual'}
            className={mode === 'manual' ? 'selected' : ''}
            disabled={busy}
            onClick={() => { setMode('manual'); setError(''); setPendingUpdate(null); }}
          >
            עריכה ידנית (אופליין)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'ai'}
            className={mode === 'ai' ? 'selected' : ''}
            disabled={busy}
            onClick={() => { setMode('ai'); setError(''); }}
          >
            עריכה חופשית עם AI
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
                <label htmlFor="manual-resi">מקום מגורים</label>
                <input id="manual-resi" value={manualForm.residencePlace} onChange={e => setManualForm(f => ({ ...f, residencePlace: e.target.value }))} />
              </div>
              <div className="manual-edit-field">
                <label htmlFor="manual-title">תואר (הרב / ד״ר / ...)</label>
                <input id="manual-title" value={manualForm.title} onChange={e => setManualForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="manual-edit-field full-span">
                <label htmlFor="manual-source">מקור המידע (אופציונלי)</label>
                <input id="manual-source" placeholder="לדוגמה: ספר זיכרון משפחתי" value={manualForm.source} onChange={e => setManualForm(f => ({ ...f, source: e.target.value }))} />
              </div>
              <div className="manual-edit-field full-span">
                <label htmlFor="manual-note">הוספת הערה חדשה (אופציונלי)</label>
                <textarea id="manual-note" rows={3} placeholder="פרט נוסף או זיכרון להוספה לרשומה..." value={manualForm.note} onChange={e => setManualForm(f => ({ ...f, note: e.target.value }))} />
              </div>
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
        ) : (
        <>
        {/* AI Provider Status Bar */}
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
            marginBottom: 12,
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

          <button
            type="button"
            onClick={() => setShowKeyInput((v) => !v)}
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
            <Key size={12} />
            <span>{showKeyInput ? 'הסתר הגדרות' : 'מפתח API (OpenRouter / Gemini)'}</span>
          </button>
        </div>

        {/* Collapsible Key Configuration Card */}
        {showKeyInput && (
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
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label
              htmlFor="ai-input-text"
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: '#324738',
                marginBottom: 6,
              }}
            >
              טקסט חופשי לעדכון:
            </label>
            <textarea
              id="ai-input-text"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="לדוגמה: נולד ב-15 במאי 1920 בוורשה, היה נגר, ונפטר בשנת 1985 בירושלים."
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
              ה-AI ינתח את הטקסט, יציג תצוגה מקדימה של השינויים לאישור (אפשר לסמן או לערוך כל שדה), ויעדכן רק את הרשומה של אדם זה.
              {activeProvider?.id === 'openrouter'
                ? ' שים לב: במצב OpenRouter פרטי האדם והטקסט שתזין נשלחים ל-OpenRouter לעיבוד.'
                : activeProvider?.isCloud
                ? ' שים לב: במצב Google Gemini פרטי האדם והטקסט שתזין נשלחים לשרתי Google לעיבוד.'
                : ' במובייל עדיף להזין מפתח OpenRouter או Gemini, או להשתמש ב-Chrome במחשב עם AI מובנה.'}
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
                {pendingUpdate.items.map((item, idx) => (
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

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
              background: '#f7faf2',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #e1e9dc',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 12,
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
              <Bug size={14} />
              <span>מצב מפתח (הצגת JSON ו-Diff)</span>
            </label>
          </div>

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
              {!apiKey && !openRouterKey && (
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
                    הזן מפתח OpenRouter או Gemini ↗
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
                disabled={busy || !pendingUpdate.items?.some((it) => it.checked)}
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
