#!/usr/bin/env python3
"""Add ?q= / ?id= deep-link support to Anafim App.jsx."""
from pathlib import Path

p = Path('family-viewer/src/App.jsx')
text = p.read_text()
if 'getUrlDeepLink' in text and 'deepLinkApplied' in text:
    print('already applied')
    raise SystemExit(0)

helpers = r'''
function getUrlDeepLink() {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = (params.get('id') || '').trim();
    const q = (params.get('q') || params.get('person') || params.get('name') || '').trim();
    return { id, q };
  } catch {
    return { id: '', q: '' };
  }
}

/** Resolve a person id from deep-link id or name query. */
function findPersonIdFromDeepLink(data, { id, q }) {
  if (!data?.people) return null;
  if (id && data.people[id]) return id;
  if (!q) return null;
  const nq = normalize(q);
  const terms = nq.split(/\s+/).filter(Boolean);
  if (!terms.length) return null;
  for (const pid of data.order) {
    const person = data.people[pid];
    if (normalize(person.name) === nq) return pid;
  }
  const hits = data.order.filter(pid => terms.every(t => data.people[pid].search.includes(t)));
  if (!hits.length) return null;
  if (hits.length === 1) return hits[0];
  const preferred = hits.find(pid => normalize(data.people[pid].name).startsWith(nq));
  if (preferred) return preferred;
  hits.sort((a, b) => data.people[a].name.length - data.people[b].name.length);
  return hits[0];
}

'''

anchor = "const APP_VERSION = '2.0.1';\n"
if anchor in text:
    text = text.replace(anchor, "const APP_VERSION = '2.0.2';\n" + helpers, 1)
elif "const APP_VERSION = '2.0.2';" in text and 'getUrlDeepLink' not in text:
    text = text.replace("const APP_VERSION = '2.0.2';\n", "const APP_VERSION = '2.0.2';\n" + helpers, 1)
else:
    raise SystemExit('APP_VERSION anchor not found')

if 'getUrlDeepLink' not in text:
    raise SystemExit('helpers not inserted')

marker = "  const person = bundle.data.people[history.ids[history.cursor]] || bundle.data.people[bundle.data.order[0]];"
effect = """
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current) return;
    const link = getUrlDeepLink();
    if (!link.id && !link.q) return;
    const pid = findPersonIdFromDeepLink(bundle.data, link);
    if (!pid) return;
    deepLinkApplied.current = true;
    setHistory({ ids: [pid], cursor: 0 });
    setView('family');
    setModal(null);
    setParentFamily('');
    const name = bundle.data.people[pid]?.name;
    if (name) setToast(`מציגים את ${name}`);
  }, [bundle]);

"""

if 'deepLinkApplied' not in text:
    if marker not in text:
        raise SystemExit('person marker not found')
    text = text.replace(marker, effect + marker, 1)

p.write_text(text)
print('deep-link support applied, size', len(text))
