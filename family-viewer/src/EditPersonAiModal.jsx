import React, { useState, useEffect } from 'react';
import { Pencil, RotateCcw, X, LoaderCircle, AlertTriangle, Check, Bug, ArrowLeft } from 'lucide-react';
import { analyzePersonTextWithAi } from './ai-service.js';
import { applyPersonUpdatesToGedcom } from './gedcom-ai-editor.js';

export function EditPersonAiModal({
  isOpen,
  onClose,
  person,
  bundle,
  onApplyUpdate,
  devMode,
  setDevMode
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setText('');
      setError('');
      setDebugInfo(null);
    }
  }, [isOpen, person.id]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!text.trim() || busy) return;

    setBusy(true);
    setError('');
    setDebugInfo(null);

    try {
      const result = await analyzePersonTextWithAi(person, text, { devMode });

      setDebugInfo({
        rawResponse: result.rawResponse,
        parsedJson: result.parsedJson,
        diff: result.diff,
        errors: result.errors,
        valid: result.valid
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

      // Apply changes to GEDCOM
      const updatedRaw = applyPersonUpdatesToGedcom(bundle.raw, person.id, result.sanitized);

      onApplyUpdate({
        updatedRaw,
        updates: result.sanitized,
        diff: result.diff
      });

      onClose();
    } catch (err) {
      console.error('[AI Editor] Failed:', err);
      setError(err.message || 'אירעה שגיאה בעיבוד הטקסט.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="dialog ai-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-edit-title" style={{ maxWidth: 520, width: '92%' }}>
        <button className="icon-button dialog-close" onClick={onClose} disabled={busy} aria-label="סגירה">
          <X size={20} />
        </button>

        <div className="dialog-heading">
          <span className="dialog-icon" style={{ background: '#f5eee6', color: '#8d5b43' }}>
            <Pencil size={22} />
          </span>
          <h2 id="ai-edit-title">עריכת פרטים באמצעות AI</h2>
          <p>
            עדכון נתונים עבור <strong dir="auto">{person.name}</strong> על בסיס טקסט חופשי (עברית או אנגלית).
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="ai-input-text" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#324738', marginBottom: 6 }}>
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
                fontSize: 13,
                lineHeight: 1.6,
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
              autoFocus
            />
            <span style={{ fontSize: 11, color: '#687b5a', display: 'block', marginTop: 4 }}>
              ה-AI ינתח את הטקסט, יוודא תקינות מבנה GEDCOM ויעדכן רק את הרשומה של אדם זה.
              במובייל עדיף Chrome במחשב עם AI מובנה — מודל מקומי דורש הורדה של ~120MB.
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, background: '#f7faf2', padding: '8px 12px', borderRadius: 8, border: '1px solid #e1e9dc' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#445a40', cursor: 'pointer' }}>
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
            <div className="error-message" role="alert" style={{ marginBottom: 14, alignItems: 'flex-start' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ whiteSpace: 'pre-line', lineHeight: 1.5 }}>{error}</span>
            </div>
          )}

          {devMode && debugInfo && (
            <div style={{ marginBottom: 14, background: '#f3f6ee', border: '1px solid #d5e0cd', borderRadius: 8, padding: 10, fontSize: 11 }}>
              <strong style={{ display: 'block', marginBottom: 4, color: '#2c4230' }}>פלט AI ו-Diff (מצב מפתח):</strong>
              <div style={{ marginBottom: 6 }}>
                <strong>סטטוס ולידציה:</strong> {debugInfo.valid ? 'תקין (Valid)' : 'שגיאה (Invalid)'}
              </div>
              {debugInfo.diff && (
                <div style={{ marginBottom: 6 }}>
                  <strong>שינויים (Diff):</strong>
                  <pre style={{ margin: '4px 0', padding: 6, background: '#fff', border: '1px solid #e0e7d8', borderRadius: 6, overflow: 'auto', maxHeight: 120 }}>
                    {JSON.stringify(debugInfo.diff, null, 2)}
                  </pre>
                </div>
              )}
              {debugInfo.rawResponse && (
                <div>
                  <strong>תשובת AI גולמית:</strong>
                  <pre style={{ margin: '4px 0', padding: 6, background: '#fff', border: '1px solid #e0e7d8', borderRadius: 6, overflow: 'auto', maxHeight: 100 }}>
                    {debugInfo.rawResponse}
                  </pre>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button
              type="button"
              className="button button-white"
              onClick={onClose}
              disabled={busy}
            >
              ביטול
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={!text.trim() || busy}
            >
              {busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
              <span>{busy ? 'מעבד נתונים...' : 'עדכן פרטים'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
