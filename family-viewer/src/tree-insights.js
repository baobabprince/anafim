import { getYear, normalize } from './gedcom.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function parseMonthDayYear(date = '') {
  const raw = String(date || '').trim();
  if (!raw) return null;
  const m = raw.match(/\b(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s+(\d{3,4}))?\b/i);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS.indexOf(m[2].toUpperCase());
  const year = m[3] ? Number(m[3]) : null;
  if (month < 0 || day < 1 || day > 31) return null;
  return { day, month, year };
}

/**
 * Find births, deaths (yahrzeit), and marriages occurring in the current calendar month.
 * Sorted with today's milestones first, then upcoming days in the month, then earlier days.
 */
export function getMonthlyMilestones(data, referenceDate = new Date()) {
  if (!data?.people) return [];
  const targetMonth = referenceDate.getMonth();
  const todayDay = referenceDate.getDate();
  const currentYear = referenceDate.getFullYear();
  const items = [];

  for (const id of data.order || Object.keys(data.people)) {
    const p = data.people[id];
    if (!p) continue;
    const birth = parseMonthDayYear(p.birth?.date);
    if (birth && birth.month === targetMonth) {
      items.push({
        type: 'birth',
        personId: p.id,
        title: p.name,
        day: birth.day,
        year: birth.year,
        yearsAgo: birth.year && birth.year <= currentYear ? currentYear - birth.year : null,
        isToday: birth.day === todayDay,
        dateRaw: p.birth.date,
      });
    }
    const death = parseMonthDayYear(p.death?.date);
    if (death && death.month === targetMonth) {
      items.push({
        type: 'death',
        personId: p.id,
        title: p.name,
        day: death.day,
        year: death.year,
        yearsAgo: death.year && death.year <= currentYear ? currentYear - death.year : null,
        isToday: death.day === todayDay,
        dateRaw: p.death.date,
      });
    }
  }

  for (const fam of Object.values(data.families || {})) {
    const marr = parseMonthDayYear(fam.marriage?.date);
    if (!marr || marr.month !== targetMonth) continue;
    const partners = (fam.partners || []).map(pid => data.people[pid]).filter(Boolean);
    if (!partners.length) continue;
    items.push({
      type: 'marriage',
      personId: partners[0].id,
      title: partners.map(p => p.name).join(' ו'),
      day: marr.day,
      year: marr.year,
      yearsAgo: marr.year && marr.year <= currentYear ? currentYear - marr.year : null,
      isToday: marr.day === todayDay,
      dateRaw: fam.marriage.date,
    });
  }

  items.sort((a, b) => {
    const rank = d => (d === todayDay ? 0 : d > todayDay ? 1 : 2);
    const ra = rank(a.day);
    const rb = rank(b.day);
    if (ra !== rb) return ra - rb;
    return a.day - b.day || (a.year || 9999) - (b.year || 9999);
  });

  return items;
}

/**
 * Analyze genealogy data completeness and detect potential anomalies or duplicates.
 */
export function analyzeTreeHealth(data) {
  const order = data?.order || [];
  const people = data?.people || {};
  const missingBirthDate = [];
  const missingParents = [];
  const impossibleDates = [];
  const nameYearBuckets = new Map();
  const placeCounts = new Map();

  for (const id of order) {
    const p = people[id];
    if (!p) continue;
    const birthYear = getYear(p.birth?.date);
    const deathYear = getYear(p.death?.date);

    if (!birthYear) missingBirthDate.push(p);
    if (!p.parentFamilies?.length) missingParents.push(p);

    if (birthYear && deathYear) {
      if (deathYear < birthYear) {
        impossibleDates.push({ person: p, reason: `פטירה (${deathYear}) לפני לידה (${birthYear})` });
      } else if (deathYear - birthYear > 120) {
        impossibleDates.push({ person: p, reason: `גיל חריג (${deathYear - birthYear} שנים)` });
      }
    }

    const normName = normalize(p.name);
    if (normName && normName !== 'שם לא ידוע') {
      const key = `${normName}|${birthYear || ''}`;
      if (!nameYearBuckets.has(key)) nameYearBuckets.set(key, []);
      nameYearBuckets.get(key).push(p);
    }

    const place = (p.birth?.place || '').trim();
    if (place) {
      placeCounts.set(place, (placeCounts.get(place) || 0) + 1);
    }
  }

  const possibleDuplicates = [];
  for (const group of nameYearBuckets.values()) {
    if (group.length > 1) {
      possibleDuplicates.push(group);
    }
  }

  const topPlaces = [...placeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([place, count]) => ({ place, count }));

  return {
    totalPeople: order.length,
    missingBirthDateCount: missingBirthDate.length,
    missingParentsCount: missingParents.length,
    impossibleDates,
    possibleDuplicates,
    topPlaces,
  };
}
