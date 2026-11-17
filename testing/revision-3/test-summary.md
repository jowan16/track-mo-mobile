# Track Mo, Pake Ko! UT and IT Revision 3 Summary

Execution date: 2026-11-17 (Asia/Manila)
Branch: `test/automated-ut-it`

## Current automated results

| Category | Suites | Cases | Passed | Failed | Pass rate |
|---|---:|---:|---:|---:|---:|
| Unit tests | 9 | 134 | 134 | 0 | 100.00% |
| Integration tests | 10 | 27 | 27 | 0 | 100.00% |
| Combined suite | 19 | 161 | 161 | 0 | 100.00% |

The pass rate is PASS / (PASS + FAIL); untested manual scenarios are excluded from the denominator.

## Coverage

- Statements: 42.96% (1,564 / 3,640)
- Lines: 44.27% (1,431 / 3,232)
- Functions: 40.06% (353 / 881)
- Branches: 35.82% (1,323 / 3,693)

Coverage is whole-source collection. Utilities have high coverage, but many screens and route flows remain untested.

## Validation

- `npm run test:unit`: PASS
- `npm run test:integration`: PASS
- `npm run test:all`: PASS
- `npm run test:ci`: PASS; generates `coverage/` below this folder
- `npx tsc --noEmit`: PASS
- `npx expo export --platform web --output-dir /tmp/track-mo-web-export-final`: PASS
- `git diff --check`: PASS
- `npx expo lint`: NOT CONFIGURED. Expo CLI attempted to add ESLint dependencies, then the command was interrupted before completion. The temporary manifest change was removed; package-lock.json is unchanged.

## Not tested

No live Supabase, production records, email delivery, real camera/gallery, actual OCR accuracy, Android device, or manual acceptance test was used. The integration document lists implemented user workflows not exercised by this automated suite.

## Evidence

- `unit-test-results.txt`
- `integration-test-results.txt`
- `test-all-results.txt`
- `test-ci-results.txt`
- `unit-jest-results.json`
- `integration-jest-results.json`
- `coverage/coverage-summary.json`, `coverage/lcov.info`, and `coverage/index.html`
