# Public GEDCOM regression fixtures

These public, third-party test files are used to ensure the viewer opens files not produced by this application. They are not user-supplied family information. The fixtures are used in both unit tests and real browser file-picker uploads under a restrictive `worker-src 'none'` CSP.

## arbre-app/read-gedcom

Source: https://github.com/arbre-app/read-gedcom/tree/master/tests/data

Files: `sample555.ged`, `sample55516le.ged`, `sample55516be.ged`, `TGC551.ged`, `TGC55CLF.ged`.

Original files are retained byte for byte, including UTF-16, ANSEL, line endings and BOMs. The test package's MIT license is included in `read-gedcom-LICENSE.txt`.

## frizbog/gedcom4j

Source: https://github.com/frizbog/gedcom4j/tree/master/sample

Files: `ftmcustomtags.ged`, `legacynocustomtags.ged`, `famhistnocustomtags.ged`.

These repository fixtures have headers from Family Tree Maker, Legacy and Family Historian. The project's MIT license is included in `gedcom4j-LICENSE.txt`.

Fixtures downloaded for regression testing on 2026-10-18. No network access is used when the tests run or when an end user's file is imported.
