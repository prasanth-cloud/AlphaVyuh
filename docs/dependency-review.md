# Dependency review — 2026-10-13

The frontend dependency update removes the reported serialization and selector-parser advisories while preserving Next.js 16, Tailwind CSS 3, and the existing PWA integration. This is a bounded dependency review, not a security certification or a claim that the product has no vulnerabilities.

## Exact transitive overrides

| Package | Previous installed version | Override | Reason |
| --- | --- | --- | --- |
| `postcss-selector-parser` | `6.1.4` in Tailwind/PostCSS nesting | `7.1.6` | Fixes quadratic parsing of crafted flat selectors. |
| `serialize-javascript` | `4.0.0` in the Workbox minification chain | `7.0.5` | Fixes both code injection during serialization and CPU exhaustion with crafted array-like objects. |

These are deliberate transitive major-version overrides, not ordinary semver patch updates. The serializer retains its CommonJS callable interface and requires Node 20 or newer; this repository's CI uses Node 22. The selector parser's major change makes insertions during iteration safe. Build and minification checks are required because Tailwind and Workbox originally requested earlier major versions.

The initial serializer candidate `7.0.3` fixed the code-injection advisory but introduced exposure to a separate advisory affecting versions `>=5.0.0 <7.0.5`. The final exact pin is therefore `7.0.5`. The npm and Bun locks also preserve the selected exact Supabase client versions: `@supabase/ssr` `0.10.3` and `@supabase/supabase-js` `2.117.3`.

Primary sources:

- [Selector-parser CPU exhaustion advisory and patched version](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).
- [Serializer code-injection advisory](https://github.com/advisories/GHSA-5c6j-r48x-rmvq).
- [Serializer array-like object CPU exhaustion advisory](https://github.com/advisories/GHSA-qj8w-gfj5-8c6v) and [7.0.5 release](https://github.com/yahoo/serialize-javascript/releases/tag/v7.0.5).
- [Serializer Node 20 requirement](https://github.com/yahoo/serialize-javascript/releases/tag/v7.0.0).

## Remaining advisory

The fresh frontend npm audit reports **13 high, 0 moderate, and 0 critical package findings**. All 13 remaining findings propagate from one advisory: [braces stack-exhaustion denial of service, GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The advisory lists no patched version, and the npm registry still publishes `3.0.3` as the latest release. The audit count is not zero.

The affected dependency paths include Tailwind's glob matching and file watching, Next's ESLint plugin, the shadcn registry/CLI and its ts-morph tooling, and next-pwa's globby dependency. Their presence in a production dependency section does not by itself establish a reachable HTTP attack path.

The inspected application code under `frontend/app`, `frontend/components`, and `frontend/lib` does not import these globbing or serialization libraries. The identified call sites process source-file patterns, selectors, or minifier options during build, lint, component generation, and service-worker generation:

- `frontend/tailwind.config.ts` supplies repository source globs; `frontend/postcss.config.mjs` runs Tailwind during CSS compilation.
- `frontend/next.config.mjs` invokes next-pwa's build integration. Workbox serializes developer-controlled Terser options before its minification worker evaluates them.
- shadcn and ts-morph are development/component-generation tooling; no application request handler importing them was found.

This supports treating the observed exposure as tooling/build input risk rather than a demonstrated public request vulnerability. It does not prove the absence of other call paths. Malicious patterns supplied to these tools can still exhaust a developer or CI process. Keep component registries and build inputs trusted, and reassess if any server feature starts accepting user-controlled globs or CSS selectors.

Do not use `npm audit fix --force` to remove this advisory by downgrading Next's lint configuration, downgrading next-pwa, or migrating Tailwind across a major version without a separate compatibility review. Re-check for a patched braces release; otherwise assess a reviewed upstream replacement or a dedicated migration in its own change.

## Verification

- Clean frontend installation with npm 11 completed successfully; npm 10's peer-resolution failure was avoided without `--force` or `--legacy-peer-deps`.
- Bun 1.4.3 accepted the frozen frontend lockfile. Its lockfile was imported from the verified npm lock because the previous two locks selected different direct dependency versions. All direct versions now agree, including the exact overrides and Supabase client pins above. The [Bun lockfile documentation](https://bun.com/docs/pm/lockfile) describes this migration and the lockfile-only mode used here.
- Before applying overrides, the actual Tailwind configuration compiled `app/globals.css` with a byte-identical result under selector-parser `7.1.6`: 140,007 bytes, SHA-256 `f2eadcbafda886df22d5c36cbe9e7a2a1286d472bba7c49727db6893850c186c`. The actual rollup-plugin-terser worker also produced identical minified code under the initial serializer candidate. The final `7.0.5` pin is additionally covered by production-build verification.
- Production `next build --webpack` passed, including TypeScript, PWA generation, and 59 prerendered pages. The generated service-worker and Workbox JavaScript also pass `node --check`.
- A separate `tsc --noEmit` passed. Final frontend unit tests passed: 736 tests across 119 files. ESLint completed with 0 errors and 14 warnings.
- This verification used local source and installed dependencies. It did not test hosted Supabase, broker execution, or every possible third-party CLI/registry input.
