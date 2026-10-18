# Changelog

## 2.0.1 — 2026-10-18

- Replaced header-first encoding guesses with a shared byte-based decoder: UTF-8/UTF-16 BOMs, structural BOM-less UTF-16, whole-file UTF-8 validation, legacy declarations and conservative damaged-UTF-8 handling.
- Valid UTF-8 now overrides stale ANSEL/Windows declarations, while manual selection still wins. Malformed Unicode and uncertain legacy guesses are reported instead of silently switching the whole dataset.
- Added actual encoding versus original CHAR diagnostics and propagated encoding warnings through both the real worker and the protected local fallback.
- Expanded README into a complete standalone operator/developer guide: Supabase schema/RLS verification, current public keys, Google OAuth origins and callbacks, redirect URLs, environment/JSON configuration, HTTPS/CSP, deployment, recovery, maintenance, upgrades and troubleshooting.
- Added UTF-8/BOM/stale-header/damaged-byte/UTF-16/legacy/offset/manual-override regression tests and browser coverage for worker, fallback and offline standalone imports.
- Cloud schema and encrypted snapshot format remain unchanged. Previously misdecoded cached/cloud snapshots must be reimported from the original GEDCOM; this release does not invent missing bytes.

## 2.0.0 — 2026-10-18

### Optional Google account and client-encrypted cloud vault

- Added an explicitly unconfigured-by-default Supabase Auth/Google PKCE integration, public project configuration and setup SQL download.
- Random AES-256-GCM data keys, HKDF-derived WebAuthn PRF and recovery key wraps, authenticated owner/revision contexts, bounded compression/decompression and mandatory recovery confirmation. Google identifiers are never encryption passwords.
- Added memory-only unlock, Passkey/recovery opening, additional Passkey enrollment, lock/logout clearing and ten-minute idle locking.
- Added private Storage and per-user PostgreSQL RLS with restrictive legacy-policy guards, immutable revision uploads, advisory-lock-serialized compare-and-swap commits and retained encrypted history.
- Added opt-in automatic synchronization, focus/online/poll/realtime updates, retry after a failed upload, explicit dirty-local conflict resolution and guarded asynchronous view replacement.
- Updated privacy language and explicitly labeled the existing optional plaintext local cache. Offline local import and worker fallback remain supported.
- Added build/runtime rejection of server keys in client config, static hosting security headers, operator setup and threat-model documentation.
- Added Web Crypto, real local PostgreSQL access-control, virtual-authenticator PRF, second-device recovery/sync, unsupported-PRF, OAuth redirect-contract and ciphertext-only upload tests.

Cloud setup is NOT performed by packaging this release. Real operator-owned Google/Supabase integration, physical passkey-provider testing and independent security review remain required before production.

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
