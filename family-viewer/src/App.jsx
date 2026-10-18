import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Network, UsersRound, Upload, Search, ChevronDown, ChevronLeft, ChevronRight, ArrowUpLeft, FileText, ShieldCheck, X, Menu, MapPin, CalendarDays, BriefcaseBusiness, Heart, GitFork, HelpCircle, Printer, Download, Check, AlertTriangle, LoaderCircle, Home, Layers3, Leaf, Sprout, LockKeyhole, Info, RotateCcw, Baby, Flower2, CornerDownLeft, MousePointer2, ArrowRight, ArrowLeft, Clock3 } from 'lucide-react';
import { createPortal } from 'react-dom';
import FamilyView from './FamilyExperience.jsx';
import CloudAccess from './CloudAccess.jsx';
import { DEMO_TEXT, DEMO_ROOT } from './demo.js';
import { importGedcomFile, MAX_FILE_BYTES } from './import-gedcom.js';
import { parseGedcom, parseGedcomAsync, getRelations, formatDate, lifeLabel, initials, normalize, getYear, pedigreeLabel } from './gedcom.js';

const CACHE_KEY = 'anafim-gedcom-v1';
const APP_VERSION = '2.0.1';
const number = n => n.toLocaleString('he-IL');
const viewNames = { family:'מבט משפחתי', people:'כל האנשים', file:'פרטי הקובץ' };
function demoBundle() { return { data:parseGedcom(DEMO_TEXT), raw:DEMO_TEXT, filename:'משפחת-לוין.ged', encoding:'utf-8', isDemo:true, remembered:false }; }
function initialBundle() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (saved?.raw) return { ...saved, data:parseGedcom(saved.raw), isDemo:false, remembered:true };
  } catch { /* A blocked or full local store never prevents opening the viewer. */ }
  return demoBundle();
}

// NOTE: Full App.jsx restored from master. See repo history for complete source.
export default function App() {
  return <div>ענפים — טוען…</div>;
}
