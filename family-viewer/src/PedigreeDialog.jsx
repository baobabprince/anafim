import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ImageDown, Printer, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import {
  CHART_PAPERS,
  buildPedigreeGraph,
  chartPrintNameSize,
  connectedLineage,
  createPedigreeSvg,
  createPosterTileSvgs,
  resolveChartPage,
} from './pedigree-svg.js';
import { exportSvgToPng, photoToSafeDataUrl } from './chart-export.js';
import { chartFonts } from './chart-fonts.js';
import { PersonPhotoContext } from './PersonPhotoContext.jsx';
import { getBundlePhotoPersonIds, getPersonPhotos } from './photo-storage.js';
import { useI18n } from './i18n/I18nContext.jsx';
import './pedigree.css';

const cssEscape = value => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&'));
const ZOOM_STEPS = [50, 75, 100, 150, 200, 300, 400];

export default function PedigreeDialog({ Dialog, data, person, parentFamily, onClose }) {
  const { lang, t } = useI18n();
  const photoContext = useContext(PersonPhotoContext);
  const [mode, setMode] = useState('ancestors');
  const [generations, setGenerations] = useState(3);
  const [descendantGenerations, setDescendantGenerations] = useState(3);
  const [ancestorOrientation, setAncestorOrientation] = useState('vertical');
  const [includeBranches, setIncludeBranches] = useState(false);
  const [branchGenerations, setBranchGenerations] = useState(1);
  const [compactBranches, setCompactBranches] = useState(true);
  const [siblingLayout, setSiblingLayout] = useState('ring');
  const [showPlaces, setShowPlaces] = useState(false);
  const [showMarriageYears, setShowMarriageYears] = useState(false);
  const [showGenerationLabels, setShowGenerationLabels] = useState(true);
  const [showPhotos, setShowPhotos] = useState(false);
  const [chartPhotos, setChartPhotos] = useState({});
  const [photosLoaded, setPhotosLoaded] = useState(false);
  const [paper, setPaper] = useState('A4');
  const [pageOrientation, setPageOrientation] = useState('auto');
  const [posterPages, setPosterPages] = useState('1x1');
  const [zoom, setZoom] = useState(100);
  const [highlightedId, setHighlightedId] = useState(null);
  const [isPanning, setIsPanning] = useState(false);

  const previewRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);

  const chartGenerations = mode === 'descendants' ? descendantGenerations : generations;
  const model = useMemo(
    () => buildPedigreeGraph(data, person.id, { generations: chartGenerations, mode, parentFamily, includeBranches, branchGenerations }),
    [data, person.id, chartGenerations, mode, parentFamily, includeBranches, branchGenerations]
  );

  useEffect(() => {
    setHighlightedId(null);
  }, [person.id, mode, chartGenerations, includeBranches, branchGenerations]);

  useEffect(() => {
    if (!showPhotos) {
      setChartPhotos({});
      setPhotosLoaded(false);
      return;
    }
    let active = true;
    const bundleId = photoContext?.bundleId;
    const remembered = photoContext?.remembered;
    const transient = photoContext?.photos;
    const loadPhotos = async () => {
      const next = {};
      try {
        const storedIds = remembered && bundleId ? await getBundlePhotoPersonIds(bundleId) : new Set();
        for (const id of model.people.keys()) {
          if (!active) return;
          let candidate = null;
          if (transient && Object.hasOwn(transient, id)) {
            const entry = transient[id];
            candidate = Array.isArray(entry) ? entry[0] : entry;
          }
          if (!candidate && storedIds.has(id) && bundleId) {
            const stored = await getPersonPhotos(bundleId, id);
            candidate = stored[0] || null;
          }
          if (candidate) {
            const dataUrl = await photoToSafeDataUrl(candidate, 128);
            if (dataUrl && active) next[id] = dataUrl;
          }
        }
      } catch {
        // Ignore storage errors and render available avatars.
      } finally {
        if (active) {
          setChartPhotos(next);
          setPhotosLoaded(true);
        }
      }
    };
    loadPhotos();
    return () => { active = false; };
  }, [showPhotos, model, photoContext?.bundleId, photoContext?.remembered, photoContext?.photos, photoContext?.revision]);

  const svg = useMemo(() => createPedigreeSvg(data, person.id, {
    generations: chartGenerations,
    mode,
    parentFamily,
    includeBranches,
    branchGenerations,
    compactBranches,
    siblingLayout,
    ancestorOrientation,
    showPlaces,
    showMarriageYears,
    showGenerationLabels,
    showPhotos,
    photos: chartPhotos,
    paper,
    lang,
    fonts: chartFonts,
  }), [
    data, person.id, chartGenerations, mode, parentFamily, includeBranches,
    branchGenerations, compactBranches, siblingLayout, ancestorOrientation,
    showPlaces, showMarriageYears, showGenerationLabels, showPhotos, chartPhotos, paper, lang,
  ]);

  const lineage = useMemo(() => (highlightedId ? connectedLineage(model, highlightedId) : null), [model, highlightedId]);

  const highlightCss = useMemo(() => {
    if (!lineage || !highlightedId) return '';
    const selectors = [];
    for (const id of lineage.people) selectors.push(`.chart-preview .person[data-person-id="${cssEscape(id)}"]`);
    for (const fid of lineage.families) {
      const ef = cssEscape(fid);
      selectors.push(
        `.chart-preview .family-node[data-family-id="${ef}"]`,
        `.chart-preview g[data-family-id="${ef}"][data-relation="partner"]`,
        `.chart-preview g[data-family-id="${ef}"][data-relation="cluster"]`,
        `.chart-preview .branch-ring[data-family-id="${ef}"]`
      );
      for (const pid of lineage.people) {
        selectors.push(`.chart-preview g[data-family-id="${ef}"][data-person-id="${cssEscape(pid)}"][data-relation="child"]`);
      }
    }
    return `${selectors.join(',')}{opacity:1!important}.chart-preview .person[data-person-id="${cssEscape(highlightedId)}"] .box{stroke:#2f4222;stroke-width:2.6}`;
  }, [lineage, highlightedId]);

  const resolvedPage = useMemo(() => resolveChartPage(svg, paper, pageOrientation), [svg, paper, pageOrientation]);
  const [posterCols, posterRows] = useMemo(
    () => String(posterPages || '1x1').split('x').map(n => Math.max(1, Number(n) || 1)),
    [posterPages]
  );
  const posterTiles = useMemo(
    () => (posterPages === '1x1' ? [{ index: 1, total: 1, svg }] : createPosterTileSvgs(svg, { cols: posterCols, rows: posterRows })),
    [svg, posterPages, posterCols, posterRows]
  );

  const download = () => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'anafim-pedigree.svg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const downloadPng = () => exportSvgToPng(svg, { filename: 'anafim-pedigree.png', scale: 2 });

  const print = async () => {
    // Wait for the embedded chart fonts before opening the print dialog.
    if (document.fonts?.ready) await document.fonts.ready;
    const style = document.createElement('style');
    style.textContent = `@page { size: ${paper} ${resolvedPage.orientation}; margin: 10mm; }`;
    document.head.appendChild(style);
    document.body.classList.add('chart-printing');
    let timer;
    const cleanup = () => { clearTimeout(timer); document.body.classList.remove('chart-printing'); style.remove(); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    timer = setTimeout(cleanup, 60000); // Fallback for browsers that do not fire afterprint.
    try { window.print(); } catch (error) { cleanup(); throw error; }
  };

  const handlePointerDown = e => {
    if (e.button !== 0 || !previewRef.current) return;
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      left: previewRef.current.scrollLeft,
      top: previewRef.current.scrollTop,
      moved: false,
    };
  };
  const handlePointerMove = e => {
    const d = dragRef.current;
    if (!d || !previewRef.current) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 4) {
      d.moved = true;
      setIsPanning(true);
    }
    if (d.moved) {
      previewRef.current.scrollLeft = d.left - dx;
      previewRef.current.scrollTop = d.top - dy;
    }
  };
  const endPan = () => {
    if (dragRef.current?.moved) {
      suppressClickRef.current = true;
      setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    dragRef.current = null;
    setIsPanning(false);
  };
  const handlePreviewClick = e => {
    if (suppressClickRef.current) return;
    const personEl = e.target.closest?.('.person[data-person-id]');
    if (personEl) {
      const id = personEl.getAttribute('data-person-id');
      if (id && model.people.has(id)) setHighlightedId(cur => (cur === id ? null : id));
      return;
    }
    if (highlightedId) setHighlightedId(null);
  };
  const handleWheel = e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(cur => Math.min(400, Math.max(50, cur + (e.deltaY < 0 ? 25 : -25))));
  };

  const highlightedPerson = highlightedId ? model.people.get(highlightedId) : null;
  const printNamePt = chartPrintNameSize(svg, paper, { orientation: pageOrientation, posterPages });

  return <>
    <Dialog title={t('chart.title')} subtitle={t('chart.subtitle')} onClose={onClose} className="pedigree-dialog">
      <div className="chart-controls-grid">
        <div className="chart-options"><label htmlFor="chart-mode">{t('chart.mode')}</label><select id="chart-mode" value={mode} onChange={e => setMode(e.target.value)}><option value="ancestors">{t('chart.ancestors')}</option><option value="descendants">{t('chart.descendants')}</option></select></div>
        {mode === 'ancestors' ? <>
          <div className="chart-options"><label htmlFor="chart-generations">{t('chart.generations')}</label><select id="chart-generations" value={generations} onChange={e => setGenerations(Number(e.target.value))}><option value="3">{t('chart.three')}</option><option value="4">{t('chart.four')}</option><option value="5">{t('chart.five')}</option><option value="6">{t('chart.six')}</option></select></div>
          <div className="chart-options"><label htmlFor="ancestor-orientation">{t('chart.ancestorOrientation')}</label><select id="ancestor-orientation" value={ancestorOrientation} onChange={e => setAncestorOrientation(e.target.value)}><option value="vertical">{t('chart.vertical')}</option><option value="horizontal">{t('chart.horizontal')}</option></select></div>
        </> : <>
          <div className="chart-options"><label htmlFor="descendant-generations">{t('chart.descendantGenerations')}</label><select id="descendant-generations" value={descendantGenerations} onChange={e => setDescendantGenerations(Number(e.target.value))}><option value="2">{t('chart.two')}</option><option value="3">{t('chart.three')}</option><option value="4">{t('chart.four')}</option><option value="5">{t('chart.five')}</option><option value="6">{t('chart.six')}</option></select></div>
          <div className="chart-options"><label htmlFor="sibling-layout">{t('chart.siblingLayout')}</label><select id="sibling-layout" value={siblingLayout} onChange={e => setSiblingLayout(e.target.value)}><option value="ring">{t('chart.siblingRing')}</option><option value="grid">{t('chart.siblingGrid')}</option></select></div>
        </>}
        <div className="chart-options"><label htmlFor="chart-paper">{t('chart.paper')}</label><select id="chart-paper" value={paper} onChange={e => setPaper(e.target.value)}><option value="A4">A4</option><option value="A3">A3</option><option value="A2">A2</option></select></div>
        <div className="chart-options"><label htmlFor="page-orientation">{t('chart.pageOrientation')}</label><select id="page-orientation" value={pageOrientation} onChange={e => setPageOrientation(e.target.value)}><option value="auto">{t('chart.orientationAuto')}</option><option value="landscape">{t('chart.orientationLandscape')}</option><option value="portrait">{t('chart.orientationPortrait')}</option></select></div>
        <div className="chart-options"><label htmlFor="poster-pages">{t('chart.posterPages')}</label><select id="poster-pages" value={posterPages} onChange={e => setPosterPages(e.target.value)}><option value="1x1">{t('chart.posterSingle')}</option><option value="2x1">{t('chart.poster2x1')}</option><option value="2x2">{t('chart.poster2x2')}</option></select></div>
      </div>

      <div className="chart-toggles">
        {mode === 'ancestors' && <>
          <label className="chart-branch-option"><input type="checkbox" checked={includeBranches} onChange={e => setIncludeBranches(e.target.checked)}/>{t('chart.branches')}</label>
          {includeBranches && <div className="chart-options"><label htmlFor="branch-generations">{t('chart.branchDepth')}</label><select id="branch-generations" value={branchGenerations} onChange={e => setBranchGenerations(Number(e.target.value))}><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></div>}
          {includeBranches && <label className="chart-branch-option"><input type="checkbox" checked={compactBranches} onChange={e => setCompactBranches(e.target.checked)}/>{t('chart.compactBranches')}</label>}
          {includeBranches && compactBranches && <div className="chart-options"><label htmlFor="sibling-layout">{t('chart.siblingLayout')}</label><select id="sibling-layout" value={siblingLayout} onChange={e => setSiblingLayout(e.target.value)}><option value="ring">{t('chart.siblingRing')}</option><option value="grid">{t('chart.siblingGrid')}</option></select></div>}
        </>}
        {mode === 'descendants' && <p className="chart-note">{t('chart.compactDescendantsHint')}</p>}
        <label className="chart-branch-option"><input type="checkbox" checked={showPlaces} onChange={e => setShowPlaces(e.target.checked)}/>{t('chart.showPlaces')}</label>
        <label className="chart-branch-option"><input type="checkbox" checked={showMarriageYears} onChange={e => setShowMarriageYears(e.target.checked)}/>{t('chart.showMarriageYears')}</label>
        <label className="chart-branch-option"><input type="checkbox" checked={showGenerationLabels} onChange={e => setShowGenerationLabels(e.target.checked)}/>{t('chart.showGenerationLabels')}</label>
        <label className="chart-branch-option"><input type="checkbox" checked={showPhotos} onChange={e => setShowPhotos(e.target.checked)}/>{t('chart.showPhotos')}</label>
      </div>

      {showPhotos && photosLoaded && Object.keys(chartPhotos).length === 0 && <p className="chart-note">{t('chart.noPhotosAvailable')}</p>}

      <p className="chart-note">{t(mode === 'descendants' ? 'chart.descendantExplanation' : 'chart.explanation')} {t('chart.sexLegend')} {t('chart.unionLegend')}</p>

      <div className="chart-preview-bar">
        <div className="chart-options chart-zoom">
          <label htmlFor="chart-zoom">{t('chart.zoom')}</label>
          <select id="chart-zoom" value={zoom} onChange={e => setZoom(Number(e.target.value))}>
            {ZOOM_STEPS.includes(zoom) ? null : <option value={zoom}>{zoom}%</option>}
            {ZOOM_STEPS.map(step => <option key={step} value={step}>{step}%</option>)}
          </select>
          <div className="chart-zoom-buttons">
            <button type="button" className="chart-icon-btn" aria-label={t('chart.zoomOut')} onClick={() => setZoom(z => Math.max(50, z - 25))}><ZoomOut size={15}/></button>
            <button type="button" className="chart-icon-btn" aria-label={t('chart.zoomIn')} onClick={() => setZoom(z => Math.min(400, z + 25))}><ZoomIn size={15}/></button>
            <button type="button" className="chart-icon-btn" onClick={() => setZoom(100)}><RotateCcw size={13}/>{t('chart.zoomFit')}</button>
          </div>
        </div>
        {highlightedPerson ? (
          <div className="chart-highlight-pill" role="status">
            <span>{t('chart.highlightedBranch', { name: highlightedPerson.name })}</span>
            <button type="button" onClick={() => setHighlightedId(null)}><X size={13}/>{t('chart.clearHighlight')}</button>
          </div>
        ) : (
          <span className="chart-pan-hint">{t('chart.panHighlightHint')}</span>
        )}
      </div>

      {highlightCss && <style>{highlightCss}</style>}
      <div
        ref={previewRef}
        className={`chart-preview${highlightedId ? ' has-highlight' : ''}${isPanning ? ' is-panning' : ''}`}
        role="img"
        aria-label={t('chart.preview')}
        style={{ '--chart-zoom': `${zoom}%` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onClick={handlePreviewClick}
        onWheel={handleWheel}
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      {svg.includes('data-layout="graph"') && (mode === 'descendants' || (mode === 'ancestors' && !includeBranches)) && <p className="chart-print-warning" role="status">{t('chart.complexLayout')}</p>}
      {printNamePt !== null && printNamePt * (showPlaces ? 10 / 13 : 1) < 7 && <p className="chart-print-warning" role="status">{t('chart.smallPrint')}</p>}
      <p className="chart-note">{t('chart.printHint')}</p>
      <div className="chart-actions">
        <button type="button" className="button button-primary" onClick={download}><Download size={16}/>{t('chart.download')}</button>
        <button type="button" className="button button-white" onClick={downloadPng}><ImageDown size={16}/>{t('chart.downloadPng')}</button>
        <button type="button" className="button button-white" onClick={print}><Printer size={16}/>{t('chart.print')}</button>
      </div>
    </Dialog>
    {createPortal(
      posterPages === '1x1'
        ? <div className="chart-print-output" style={{ '--chart-page-width': `${resolvedPage.width - 20}mm`, '--chart-page-height': `${resolvedPage.height - 20}mm` }} dangerouslySetInnerHTML={{ __html: svg }}/>
        : <div className="chart-print-output" style={{ '--chart-page-width': `${resolvedPage.width - 20}mm`, '--chart-page-height': `${resolvedPage.height - 20}mm` }}>{posterTiles.map(tile => <div key={tile.index} className="chart-print-page" dangerouslySetInnerHTML={{ __html: tile.svg }}/>)}</div>,
      document.body
    )}
  </>;
}
