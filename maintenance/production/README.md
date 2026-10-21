# Local production packaging

The app source remains in `dist/`. This build creates an independent publish
artifact in `release/ahlan/`. It does not deploy, push, modify hosting settings,
rewrite `dist/`, or delete an earlier release.

```powershell
npm ci --ignore-scripts --no-audit --no-fund --cache D:\ahlan\maintenance\tools\npm-cache
npm run test:production
npm run build
```

Use the `release/ahlan/` **contents** when manually publishing the optimized
artifact. The existing `.openai/hosting.json` remains unchanged and still points
to `dist/`; no hosting operation runs as part of the build.

A deterministic manifest and the esbuild license are written outside the public
directory to `release/build-reports/ahlan/`. The manifest records source/output
hashes, every exclusion, local dependency checks, legal notices, the production
PWA revision, and measured gzip/Brotli transfer sizes. Compressed sidecars are
not generated: static hosts must explicitly support `Content-Encoding` before
serving them. The output works as ordinary static files.

The same unchanged input can be built again without rewriting output. If a
different release is already present, the command stops and preserves it. Use a
new named output instead:

```powershell
node maintenance/production/Build-Release.cjs --out release/ahlan-next
```

The build uses esbuild **0.28.2**, pinned by `package-lock.json`. The tool is a
development dependency only and is not bundled into the application. Its
official transform API performs no bundling here. It preserves script ordering,
classic-script global names used by HTML handlers, module exports, property
names, CSS custom properties, animation names, and legal comments. No console
calls, content, or functions are dropped by configuration.

References: [official transform API](https://esbuild.github.io/api/#transform),
[minification](https://esbuild.github.io/api/#minify), and
[legal comments](https://esbuild.github.io/api/#legal-comments).

The 14 protected category PNGs remain unchanged in `dist/assets/categories/`.
They are omitted only from the publish artifact because the existing application
already displays its JPEG derivatives. Packaging executes the real
`imageMarkup()` helper for all 14 categories and requires all 28 existing JPEGs
before allowing that omission. Static local references to any omitted file fail
the build rather than silently shipping a broken page.

`icon-collection.html` and the Discover extraction provenance manifest are
development resources. They stay in source but are excluded from the public
artifact. Other files must pass the explicit code/media allowlist. Runtime
registries, visual fidelity, interactions and offline behavior additionally
require the app preservation tests and real-browser checks; static URL
validation alone does not claim to cover dynamic behavior.
