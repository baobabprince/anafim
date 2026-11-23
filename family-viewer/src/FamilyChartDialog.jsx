import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Printer, X, GitBranch } from 'lucide-react';
import { t } from './i18n/index.js';
import { acquireBodyScrollLock, restoreFocusSafely } from './scroll-lock.js';
import { buildFamilyChartData } from './family-chart-data.js';
import { renderFamilyChartSvg, downloadSvg, printSvg } from './family-chart-svg.js';

function safeFilename(name) {
  return String(name || 'chart')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'family-chart';
}

export function FamilyChartDialog({ data, person, onClose }) {
  const closeButton = useRef(null);
  const [generations, setGenerations] = useState(3);
  const [includeCousins, setIncludeCousins] = useState(false);
  const [orientation, setOrientation] = useState('landscape');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const previousFocus = document.activeElement;
    const releaseScrollLock = acquireBodyScrollLock();
    closeButton.current?.focus?.({ preventScroll: true });
    const onKey = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      releaseScrollLock();
      restoreFocusSafely(previousFocus);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const chart = useMemo(() => {
    try {
      return buildFamilyChartData(data, person.id, {
        generations,
        includeCousins,
        orientation,
        showPlaces: false,
      });
    } catch (err) {
      return null;
    }
  }, [data, person.id, generations, includeCousins, orientation]);

  const previewSvg = useMemo(() => {
    if (!chart) return '';
    try {
      return renderFamilyChartSvg(chart);
    } catch {
      return '';
    }
  }, [chart]);

  const runExport = useCallback(async (mode) => {
    setError('');
    setBusy(true);
    try {
      const built = buildFamilyChartData(data, person.id, {
        generations,
        includeCousins,
        orientation,
        showPlaces: false,
      });
      const svg = renderFamilyChartSvg(built);
      const filename = `ענפים-${safeFilename(person.given || person.name)}.svg`;
      if (mode === 'download') {
        downloadSvg(svg, filename);
      } else {
        printSvg(svg, orientation);
      }
    } catch (err) {
      setError(err?.message || t('fx.chartError'));
    } finally {
      setBusy(false);
    }
  }, [data, person, generations, includeCousins, orientation]);

  return createPortal(
    <div className="fx-path-backdrop" role="presentation" onClick={onClose}>
      <section
        className="fx-path-dialog fx-chart-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fx-chart-title"
        onClick={event => event.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        <header className="fx-path-heading">
          <div>
            <h2 id="fx-chart-title">{t('fx.chartTitle')}</h2>
            <p>{t('fx.chartHint')}</p>
          </div>
          <button
            ref={closeButton}
            type="button"
            className="fx-gallery-close"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        <div className="fx-chart-options" style={{ display: 'grid', gap: 14, padding: '4px 2px 12px' }}>
          <fieldset style={{ border: '1px solid #d5dec8', borderRadius: 10, padding: '10px 12px', margin: 0 }}>
            <legend style={{ padding: '0 6px', fontSize: 12, color: '#5c6b4a' }}>{t('fx.chartGenerations')}</legend>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="chart-gens"
                  checked={generations === 3}
                  onChange={() => setGenerations(3)}
                />
                <span>{t('fx.chartGen3')}</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="chart-gens"
                  checked={generations === 4}
                  onChange={() => setGenerations(4)}
                />
                <span>{t('fx.chartGen4')}</span>
              </label>
            </div>
          </fieldset>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeCousins}
              onChange={event => setIncludeCousins(event.target.checked)}
            />
            <span>{t('fx.chartCousins')}</span>
          </label>

          <fieldset style={{ border: '1px solid #d5dec8', borderRadius: 10, padding: '10px 12px', margin: 0 }}>
            <legend style={{ padding: '0 6px', fontSize: 12, color: '#5c6b4a' }}>{t('fx.chartOrientation')}</legend>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="chart-orient"
                  checked={orientation === 'landscape'}
                  onChange={() => setOrientation('landscape')}
                />
                <span>{t('fx.chartLandscape')}</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="chart-orient"
                  checked={orientation === 'portrait'}
                  onChange={() => setOrientation('portrait')}
                />
                <span>{t('fx.chartPortrait')}</span>
              </label>
            </div>
          </fieldset>
        </div>

        {previewSvg && (
          <div
            className="fx-chart-preview"
            style={{
              border: '1px solid #e0e6d6',
              borderRadius: 10,
              overflow: 'auto',
              maxHeight: 220,
              background: '#fffef9',
              marginBottom: 12,
            }}
            dangerouslySetInnerHTML={{ __html: previewSvg }}
            aria-hidden="true"
          />
        )}

        {error && (
          <p role="alert" style={{ color: '#a33', fontSize: 13, margin: '0 0 10px' }}>{error}</p>
        )}

        <footer style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="text-button"
            disabled={busy || !chart}
            onClick={() => runExport('download')}
          >
            <Download size={15} />
            <span>{t('fx.chartDownloadSvg')}</span>
          </button>
          <button
            type="button"
            className="text-button print-button"
            disabled={busy || !chart}
            onClick={() => runExport('print')}
          >
            <Printer size={15} />
            <span>{t('fx.chartPrint')}</span>
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

export function FamilyChartButton({ onClick }) {
  return (
    <button
      type="button"
      className="text-button"
      onClick={onClick}
      title={t('fx.chartTitle')}
      aria-label={t('fx.chartTitle')}
    >
      <GitBranch size={15} />
      <span>{t('fx.chartButton')}</span>
    </button>
  );
}
