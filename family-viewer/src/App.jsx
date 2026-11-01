import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Network, UsersRound, Upload, Search, ChevronDown, ChevronLeft, ChevronRight, ArrowUpLeft, FileText, ShieldCheck, X, Menu, MapPin, CalendarDays, BriefcaseBusiness, Heart, GitFork, HelpCircle, Printer, Download, Check, AlertTriangle, LoaderCircle, Home, Layers3, Leaf, Sprout, LockKeyhole, Info, RotateCcw, Baby, Flower2, CornerDownLeft, MousePointer2, ArrowRight, ArrowLeft, Clock3, Wrench } from 'lucide-react';
import { createPortal } from 'react-dom';
import FamilyView from './FamilyExperience.jsx';
import CloudAccess from './CloudAccess.jsx';
import { DEMO_TEXT, DEMO_ROOT } from './demo.js';
import { importGedcomFile, MAX_FILE_BYTES } from './import-gedcom.js';
import { saveSharedExport, loadSharedExport, hasSharedExport, formatSharedSummary } from './baobab-shared-storage.js';
import { parseGedcom, parseGedcomAsync, getRelations, formatDate, lifeLabel, initials, normalize, getYear, pedigreeLabel } from './gedcom.js';

// TEMP: full file must be restored locally - see i18n setup in src/i18n/
export default function App() {
  return <div style={{padding:40,fontFamily:'system-ui'}} dir="rtl">
    <h1>ענפים — שחזור נדרש</h1>
    <p>קובץ App.jsx נפגע בהעלאה. יש לשחזר מקומית:</p>
    <pre style={{background:'#f5f5f5',padding:16,overflow:'auto"}}>{
`git checkout ba693496fc6a46b8a052bb3fc8302fb94fbed2c6 -- family-viewer/src/App.jsx
git checkout 0635342de1f54deda4e43b181c8ac8cf583d3686 -- family-viewer/src/CloudAccess.jsx
# then apply i18n + 2-day lock (see conversation)`
    }</pre>
  </div>;
}
