# Dependency security fixes

Use Bun 1.4.4 (the version in `.bun-version` and `packageManager`). Version-scoped
and parent-scoped overrides require lockfile format 3; older Bun installers cannot
read it. `scripts/vercel-install.sh` uses Vercel's existing Bun to install the
script-free official `@oven/bun-linux-x64@1.4.4` binary in `/tmp`. Installation
and build then use that binary directly. No Node/npm/npx bootstrap is required.
Application lifecycle scripts run under the pinned Bun runtime. The esbuild
parent override uses the npm-compatible object form. The managed Functions
runtime still uses `bunVersion: "1.x"`.

## Resolution overrides

`package.json` pins patched transitive versions for fast-uri, ip-address,
source-map-js, systeminformation, Vite and Zod. Undici 7 and 8 stay on separate
patched release lines. Esbuild is upgraded only beneath `@esbuild-kit/core-utils`;
Drizzle Kit's other esbuild dependency keeps its own compatible release.

Glob moves from 10/13 to 14.0.3 and minimatch 7–10 moves to 11.0.4 because patched
releases are unavailable in those older lines. Older minimatch 3 dependencies
are unaffected by that advisory and retain their original API. Recheck these
pins when updating parent packages and remove overrides once parent ranges
exclude vulnerable releases.

## deepmerge 4.3.1

[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
has no patched upstream release as of 2026-11-05. The Bun patch defines own data
properties instead of assigning through the inherited `__proto__` setter. It
covers the source, CommonJS and UMD distributions, preserving arrays, symbols,
custom merging and ordinary object data. Regression tests exercise the copy
installed for shadcn. Replace the patch with an upstream fix when available.

`bun audit` still reports this low-severity advisory because it checks the
package version, not the patched source. No advisory is hidden or ignored.

## ESLint compatibility

ESLint 9.39.5 is the common declared peer version supported by Next's import,
React and JSX accessibility plugins. The latest releases of those plugins do
not yet declare ESLint 10 support. ESLint 9 is EOL; this is a temporary tooling
compatibility choice, not a maintained upstream release. Return to ESLint 10
when all three plugins support it. Lint rules and accessibility checks stay
active. See [ESLint's support policy](https://eslint.org/version-support/).
