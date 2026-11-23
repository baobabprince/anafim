/**
 * Build printable family-chart data from parsed GEDCOM.
 * Focus person + spouses + siblings + children + ancestors (3–4 gens) + optional cousins.
 */

import { getRelations, getYear } from './gedcom.js';

function toChartPerson(person, extras = {}) {
  if (!person) return null;
  return {
    id: person.id,
    name: person.name || '—',
    given: person.given || '',
    surname: person.surname || '',
    sex: person.sex === 'M' || person.sex === 'F' ? person.sex : '',
    birthYear: getYear(person.birth?.date),
    deathYear: getYear(person.death?.date),
    birthPlace: person.birth?.place || '',
    half: Boolean(person.half),
    ...extras,
  };
}

function pickBirthParentFamily(person) {
  if (!person?.parentFamilies?.length) return undefined;
  return (
    person.parentFamilies.find(pf => (pf.type || 'birth').toLowerCase() === 'birth') ||
    person.parentFamilies[0]
  )?.id;
}

function ancestorCouple(data, personId) {
  const person = data.people[personId];
  if (!person) return { paternal: [], maternal: [] };
  const relations = getRelations(data, personId, pickBirthParentFamily(person));
  const father = relations.parents.find(p => p.sex === 'M') || null;
  const mother = relations.parents.find(p => p.sex === 'F') || null;
  const unknowns = relations.parents.filter(p => p.sex !== 'M' && p.sex !== 'F');
  const paternal = [];
  const maternal = [];
  if (father) paternal.push(toChartPerson(father, { role: 'father' }));
  if (mother) maternal.push(toChartPerson(mother, { role: 'mother' }));
  if (!father && !mother && unknowns.length) {
    paternal.push(toChartPerson(unknowns[0], { role: 'parent' }));
    if (unknowns[1]) maternal.push(toChartPerson(unknowns[1], { role: 'parent' }));
  } else if (!father && unknowns[0]) {
    paternal.push(toChartPerson(unknowns[0], { role: 'parent' }));
  } else if (!mother && unknowns[0]) {
    maternal.push(toChartPerson(unknowns[0], { role: 'parent' }));
  }
  return { paternal, maternal, fatherId: father?.id, motherId: mother?.id };
}

function buildGrandparents(data, parents) {
  const result = { paternal: [], maternal: [] };
  if (parents.fatherId) {
    const gp = ancestorCouple(data, parents.fatherId);
    result.paternal = [
      ...gp.paternal.map(p => ({ ...p, role: 'paternal-gf' })),
      ...gp.maternal.map(p => ({ ...p, role: 'paternal-gm' })),
    ];
  }
  if (parents.motherId) {
    const gp = ancestorCouple(data, parents.motherId);
    result.maternal = [
      ...gp.paternal.map(p => ({ ...p, role: 'maternal-gf' })),
      ...gp.maternal.map(p => ({ ...p, role: 'maternal-gm' })),
    ];
  }
  return result;
}

function buildGreatGrandparents(data, grandparents) {
  const result = { paternal: [], maternal: [] };
  for (const gp of grandparents.paternal) {
    const couple = ancestorCouple(data, gp.id);
    result.paternal.push(...couple.paternal.map(p => ({ ...p, role: 'ggp' })), ...couple.maternal.map(p => ({ ...p, role: 'ggp' })));
  }
  for (const gp of grandparents.maternal) {
    const couple = ancestorCouple(data, gp.id);
    result.maternal.push(...couple.paternal.map(p => ({ ...p, role: 'ggp' })), ...couple.maternal.map(p => ({ ...p, role: 'ggp' })));
  }
  return result;
}

function buildCousinGroups(data, parents, focusId) {
  const groups = [];
  for (const { side, parentId } of [
    { side: 'paternal', parentId: parents.fatherId },
    { side: 'maternal', parentId: parents.motherId },
  ]) {
    if (!parentId) continue;
    const parentRelations = getRelations(data, parentId, pickBirthParentFamily(data.people[parentId]));
    for (const uncleAunt of parentRelations.siblings) {
      if (uncleAunt.id === focusId) continue;
      const theirKids = getRelations(data, uncleAunt.id).children.filter(c => c.id !== focusId).map(c => toChartPerson(c));
      if (!theirKids.length) continue;
      groups.push({ via: toChartPerson(uncleAunt), side, cousins: theirKids });
    }
  }
  return groups;
}

export function buildFamilyChartData(data, focusId, options = {}) {
  const generations = options.generations === 4 ? 4 : 3;
  const includeCousins = Boolean(options.includeCousins);
  const orientation = options.orientation === 'portrait' ? 'portrait' : 'landscape';
  const showPlaces = Boolean(options.showPlaces);
  const focusPerson = data.people[focusId];
  if (!focusPerson) throw new Error('Focus person not found');
  const relations = getRelations(data, focusId, pickBirthParentFamily(focusPerson));
  const focus = toChartPerson(focusPerson, { isFocus: true });
  const spouses = (relations.partners || []).map(p => toChartPerson(p, { isSpouse: true }));
  const siblings = (relations.siblings || []).map(p => toChartPerson(p, { half: Boolean(p.half) }));
  const children = (relations.children || []).map(p => toChartPerson(p));
  const parents = ancestorCouple(data, focusId);
  const parentsGen = { paternal: parents.paternal, maternal: parents.maternal };
  const grandparents = buildGrandparents(data, parents);
  const greatGrandparents = generations === 4 ? buildGreatGrandparents(data, grandparents) : undefined;
  const cousinGroups = includeCousins ? buildCousinGroups(data, parents, focusId) : undefined;
  const title = (typeof document !== 'undefined' && document.documentElement?.lang === 'en')
    ? `Family chart of ${focus.name}`
    : `אילן משפחתי של ${focus.name}`;
  return {
    focus, spouses, siblings, children,
    parents: parentsGen, grandparents, greatGrandparents, cousinGroups,
    options: { generations, includeCousins, orientation, showPlaces },
    title, generatedAt: new Date().toISOString().slice(0, 10),
  };
}
