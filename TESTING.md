# Automated testing

This repository separates fast unit tests from workflow-level integration tests.

## Commands

| Command | Purpose |
| --- | --- |
| `npm test -- --runInBand` | Run every test discovered by Jest |
| `npm run test:unit` | Run tests under `__tests__/unit` |
| `npm run test:integration` | Run tests under `__tests__/integration` |
| `npm run test:all` | Run both suites |
| `npm run test:ci` | Run all discovered tests in CI mode with coverage |

## Test boundaries

- **Unit tests** exercise individual helpers and pure functions without external services.
- **Integration tests** exercise more than one application layer together. The receipt workflow test uses the real receipt parser and expense validators. The admin metrics screen test renders the screen and uses mocked Supabase responses and mocked Expo file/print/share APIs.
- Tests in this setup do not connect to Supabase, use production credentials, or write to a database.
- Camera capture, on-device OCR execution, operating-system sharing/printing, and actual Supabase policies/RPC deployment are not verified by these mock-based tests.

## Adding tests

- Put isolated function tests in `__tests__/unit` and name them `*.test.ts` or `*.test.tsx`.
- Put cross-layer tests in `__tests__/integration` and name them `*.integration.test.ts` or `*.integration.test.tsx`.
- Mock network, native device, and Supabase boundaries. Never use production credentials or production records in automated tests.
- Prefer deterministic fixtures and fixed dates. Avoid relying on current wall-clock time except when the behavior specifically concerns today/future dates.

## Continuous integration

The GitHub Actions workflow at `.github/workflows/automated-tests.yml` installs dependencies with `npm ci` and runs `npm run test:ci` on pushes and pull requests. A green workflow is required evidence that the checked-in test suite passed in that CI run; it is not evidence of physical-device or live-backend testing.
