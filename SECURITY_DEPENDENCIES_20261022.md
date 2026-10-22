# Dependency Security Status (2026-10-22)

## Remediation and checks

- Production npm dependencies: `npm audit --omit=dev --audit-level=high` passed.
- The full dev+runtime `npm audit --audit-level=high` still reports a HIGH for `braces@3.0.3`, transitively used by build/lint tooling through `micromatch` / `fast-glob` / Tailwind CSS 3.
- Advisory: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). As checked, the advisory listed **no patched release**, and a forced `npm audit fix --force` suggests breaking framework/tooling downgrades or major upgrades.
- This risk is in the development/build toolchain, not the runtime dependency tree. Glob patterns must remain developer-controlled; do not feed attacker-supplied patterns to build tools.
- This is a documented **unresolved** dev advisory, not falsely marked fixed. Monitor a supported upstream patch and revisit promptly.
- The weekly/lock-change GitHub Actions audit enforces clean production dependencies and reports full dev advisories without pretending a nonexistent patched `braces` version exists.

## Front-end compatibility

ESLint has been updated to a patched 9.x version; `postcss-selector-parser` is pinned to a patched version with a tested compatible production build. The Python API's Render deployment status must be verified separately.

