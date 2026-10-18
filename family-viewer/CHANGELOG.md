# Changelog

## 1.3.0 — 2026-10-18

### Clearer grandparents, visible by default

- Replaced optional, tiny grandparent chips with full-name, clickable cards showing the recorded lifespan and birthplace.
- Made the grandparent generation visible by default and explicitly divided it into paternal/maternal (or unnamed-parent) sides, naming the connecting parent.
- Added visible, aligned connection stems from each grandparent side to its parent; wide trees show four grandparent cards in a row, while phones retain two readable vertical side groups without horizontal scrolling.
- Kept a collapse/restore control and clearly marked incomplete or missing grandparent data instead of inventing relatives.
- Added selection of birth/adoptive/other grandparent families where multiple parent families are recorded, and excluded self-links from cyclic data.
- Retained detailed parents and the selected-person experience, tabs, collapsed relatives and the private import fallback.
- Added regression checks for default visibility, full names, grandparent navigation, collapse/restore, branch alignment at five viewport widths, missing records and alternative grandparent families.

## 1.2.0 — 2026-10-18

### Redesigned: connected, information-rich family experience

- Replaced the family workspace with a cream, forest-green and terracotta visual system, pastel person chips, highlighted focal person and connected parent cards. No portrait images or private facts are synthesized.
- Parents display complete birth/death dates, places and occupations; the focal person also shows a documented marriage and exact age at death when calculable from complete, unqualified dates.
- Optional compact grandparent generation, one-click relative previews, expandable partner/child/sibling cards and pagination.
- Added accessible RTL keyboard-operable Details / Timeline / Sources tabs. Includes alternate names, personal attributes, contextual family events/notes/citations, publication data, page references, excerpts and original INDI records.
- Added cycle-safe, unique ancestor/descendant counts and a navigable branch explorer, plus recently visited people in the sidebar.
- Expanded backward-compatible parsing for custom event labels, addresses, causes, recorded ages, family events, family citations and supported personal attributes. The synchronous, worker and cooperative fallback paths continue using the same parser.
- Demo sources are explicitly fictional and are never added to user imports.
- Retained the local import fallback from 1.1, privacy defaults, encoding selection, search, directory, history, local persistence, GEDCOM download and portrait printing.
- Added information-helper, data-retention, expanded responsive, tab-keyboard and expanded accessibility regression tests.

## 1.1.0 — 2026-10-18

### Fixed: valid user files failed in protected viewers

The embedded demo used the synchronous GEDCOM parser, while every file upload depended on starting an external/module Web Worker. If a sandbox or CSP blocked that worker, the upload showed a generic file-reading error even though the GEDCOM was valid. There was no direct-import fallback, and transferring the only input ArrayBuffer would also prevent a retry after a worker error.

The failure was reproduced with the previous standalone HTML in an iframe with `sandbox="allow-scripts"` and `worker-src 'none'`.

- Added a shared, independently tested file-import pipeline.
- Automatically falls back to direct, local parsing if the Worker API is unavailable, construction fails, a worker script is blocked, postMessage fails, the worker crashes or its startup/progress watchdog expires.
- Keeps the original bytes available for retries; no longer transfers the only ArrayBuffer.
- Uses a cooperative asynchronous wrapper around the same parser for direct loading, yielding between chunks and supporting cancellation.
- Supports FileReader when File.arrayBuffer is unavailable or fails.
- Added specific user-facing import error codes, and correct messages for PDF, ZIP, empty and unreadable files.
- Allows content-valid GEDCOM files with non-standard filename extensions when selected by the file provider or dropped into the dialog.
- Shows viewer version and successful import method under file details.
- Added byte-for-byte, public third-party fixtures covering UTF-8, UTF-16 LE/BE, ANSEL, Family Tree Maker, Legacy and Family Historian sample exports.
- Added production-HTML browser tests inside a protected, offline iframe with workers explicitly blocked, plus unavailable/crashed/unresponsive-worker regression tests.

All genealogy data continues to be processed locally. The tests do not require or include any user's private family data.
