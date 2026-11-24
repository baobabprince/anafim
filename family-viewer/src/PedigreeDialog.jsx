import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Printer } from 'lucide-react';
import { createPedigreeSvg } from './pedigree-svg.js';
import { useI18n } from './i18n/I18nContext.jsx';
import './pedigree.css';

export default function PedigreeDialog({ Dialog, data, person, parentFamily, onClose }) {
  const { lang, t } = useI18n();
  const [generations, setGenerations] = useState(3);
  const [date] = useState(() => new Date());
  const svg = useMemo(() => createPedigreeSvg(data, person.id, { generations, parentFamily, lang, date }), [data, person.id, generations, parentFamily, lang, date]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'anafim-pedigree.svg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const print = () => {
    const style = document.createElement('style');
    style.textContent = '@page { size: A4 landscape; margin: 10mm; }';
    document.head.appendChild(style);
    document.body.classList.add('chart-printing');
    let timer;
    const cleanup = () => { clearTimeout(timer); document.body.classList.remove('chart-printing'); style.remove(); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    timer = setTimeout(cleanup, 60000); // Fallback for browsers that do not fire afterprint.
    try { window.print(); } catch (error) { cleanup(); throw error; }
  };
  return <>
    <Dialog title={t('chart.title')} subtitle={t('chart.subtitle')} onClose={onClose} className="pedigree-dialog">
      <div className="chart-options"><label htmlFor="chart-generations">{t('chart.generations')}</label><select id="chart-generations" value={generations} onChange={e => setGenerations(Number(e.target.value))}><option value="3">{t('chart.three')}</option><option value="4">{t('chart.four')}</option></select></div>
      <p className="chart-note">{t('chart.explanation')}</p>
      <div className="chart-preview" role="img" aria-label={t('chart.preview')} dangerouslySetInnerHTML={{ __html: svg }}/>
      <p className="chart-note">{t('chart.printHint')}</p>
      <div className="chart-actions"><button type="button" className="button button-primary" onClick={download}><Download size={16}/>{t('chart.download')}</button><button type="button" className="button button-white" onClick={print}><Printer size={16}/>{t('chart.print')}</button></div>
    </Dialog>
    {createPortal(<div className="chart-print-output" dangerouslySetInnerHTML={{ __html: svg }}/>, document.body)}
  </>;
}
