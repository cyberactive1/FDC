# Freedom Data Center — website source

A single-page site for Freedom Data Center / CyberActive ADCR, exported from Claude
Design and since extended. `build.py` flattens the source tree into one
self-contained HTML file that runs with **no network access at all**.

```
build.py                  flattens src/ + vendor/ -> dist/
package.json              build/preview scripts (no dependencies)
vercel.json               build command, output dir, headers
api/
  inquiries.js            serverless function: form delivery
public/
  og-freedom.jpg          1200x630 social card, copied verbatim into dist/
tools/
  make-og.py              regenerates the social card (needs Pillow)
.github/workflows/
  build.yml               CI: runs the assertions, uploads the built HTML
src/
  Freedom Data Center.dc.html   markup (template) + component logic
  fdc-motion.js           scroll/reveal/navigation layer
  fdc-visuals.js          hero decision mesh, threat globe
  fdc-adcr.js             ADCR console + Command Center canvas renderers
  support.js              Design Canvas runtime (generated — do not edit)
  image-slot.js           image-slot custom element (from the export)
  _ds/nocturne-.../       design system tokens + component CSS
  assets/                 the two logos that are actually referenced
  fonts/                  Inter 300/400/500/600/700, latin subset (self-hosted)
  brief.txt               the original design brief
vendor/                   React + ReactDOM 18.3.1 UMD, inlined by the build
dist/                     build output (git-ignored)
                            index.html                 what a host serves
                            freedom-data-center.html   what a person downloads
                            robots.txt, sitemap.xml    generated per environment
                            og-freedom.jpg             copied from public/
reference/                original console screenshots + brief .docx (not used by the build)
```

## Build

```bash
python3 build.py          # -> dist/freedom-data-center.html, then 55 assertions
```

Two deployment values come from the environment, because the source cannot know
them:

| Variable | Default | Effect |
| --- | --- | --- |
| `FDC_SITE_URL` | `https://freedomdatacenter.com` | Origin for `canonical`, `og:url`, `og:image` and the JSON-LD `url`. Set it **empty** to strip every URL-bearing metadata line and get a totally URL-free artifact. |
| `FDC_CONTACT_ENDPOINT` | *(empty)* | URL accepting a JSON `POST` from both forms. Empty means they confirm on-page and deliver **nowhere**. |

```bash
FDC_SITE_URL=https://freedomdatacenter.com \
FDC_CONTACT_ENDPOINT=https://api.freedomdatacenter.com/inquiries \
python3 build.py
```

Both are substituted into placeholders in the `.dc.html` and the build asserts no
placeholder survived — a stale `__SITE_URL__` inside a canonical tag is invisible
until a crawler reads it. The build ends with `WARN` lines for anything still
unset; those are launch blockers it cannot decide for you, not failures.

No dependencies beyond Python 3. The build inlines the runtime, React, the design
system, the JS modules, the fonts and the two images as data URIs. Output is
~2.1 MB and opens by double-click or from any host.

`dist/` is wiped at the start of every build. `robots.txt` and `sitemap.xml` are
conditional on origin and environment, and a preview build run after a production
build inherited a stale `sitemap.xml` advertising the production URL.

It ends with 55 assertions and **exits non-zero if any of them fail**, which is
what makes them binding: they used to print `FAIL` and exit `0`, so a green CI
check or a "Ready" Vercel deployment proved nothing. They exist because most
encode a bug that already happened once.

## Deploying to Vercel

Import the repo; the settings come from `vercel.json` (build `python3 build.py`,
output `dist/`). Python 3 is present in Vercel's build image, and there is nothing
to `npm install`.

`api/inquiries.js` is picked up automatically as a Node function, so the forms
post to `/api/inquiries` on the same origin and there is no CORS to configure.

**Origins are inferred, not hardcoded.** With `FDC_SITE_URL` unset the build reads
Vercel's own variables: `VERCEL_PROJECT_PRODUCTION_URL` for production,
`VERCEL_URL` for a preview. Hardcoding one origin means every preview branch
advertises the production canonical and asks Google to index the wrong build.

Preview deployments additionally get `<meta name="robots" content="noindex,
nofollow">` and a `robots.txt` of `Disallow: /`, and no sitemap. Production gets
the indexable directives and a sitemap.

### Environment variables

Set these in the Vercel project (Settings -> Environment Variables):

| Variable | Needed for | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` + `INQUIRY_TO` | emailing inquiries | `INQUIRY_FROM` must be on a Resend-verified domain; it defaults to `onboarding@resend.dev`, which only delivers to the Resend account owner |
| `INQUIRY_WEBHOOK_URL` | Slack/Zapier/CRM delivery | receives the payload verbatim |
| `FDC_SITE_URL` | overriding the inferred origin | rarely needed on Vercel |
| `FDC_CONTACT_ENDPOINT` | pointing the forms elsewhere | defaults to `/api/inquiries` on Vercel, empty locally |

**With no delivery configured, `/api/inquiries` answers 503, not 200.** A silent
200 would show the reader "Received — reference FDC-K3X9QM" for an inquiry that
reached nobody, which is the exact failure the endpoint exists to remove. The 503
makes the form show its fallback message with a real address to email. The payload
is written to the function logs either way, so a misconfiguration does not also
destroy the lead.

### The CSP needs `'unsafe-eval'`

`vercel.json` sets a real Content-Security-Policy, but `script-src` includes
`'unsafe-inline'` and `'unsafe-eval'`. Both are load-bearing, not oversights:
everything is inlined into one file by design, and `support.js` compiles the
`{{ }}` / `sc-for` template with `new Function` in two places. Removing either
directive white-screens the page. `connect-src 'self'` is what permits both the
runtime's `fetch(location.href)` re-read and the form POST.

## CI

`.github/workflows/build.yml` runs on every push and PR:

1. `python3 build.py` — the 55 assertions, as a required check.
2. The same build with `FDC_SITE_URL=''`, which exercises the metadata-stripping
   path where a removed line can leave a trailing comma in the JSON-LD.
3. `node --check` on `api/*.js`.
4. Uploads `dist/freedom-data-center.html` as a workflow artifact, since `dist/`
   is git-ignored.

## The social card

`public/og-freedom.jpg` is generated by `tools/make-og.py` from the Nocturne
tokens and the project's own Inter faces, so it cannot drift from the page it
advertises. It is committed, and `build.py` only copies it — that keeps the build
free of third-party modules. Regenerate with `pip install Pillow && python3
tools/make-og.py`.

The headline wraps to four lines. Three would be better, but "Where autonomous
operations" does not fit one line at any legible size, so the leading is tightened
to make four look intentional.

---

## How the page is structured

This is a Design Canvas document, not a normal HTML page.

- **Markup** lives inside `<x-dc>`, using `{{ value }}` interpolation,
  `<sc-for list="{{ items }}" as="i">` and `<sc-if value="{{ flag }}">`.
- **Logic** lives in `<script type="text/x-dc" data-dc-script>` as
  `class Component extends DCLogic`.
- **`renderVals()`** returns one flat object; every `{{ name }}` in the markup
  resolves against it. If a binding renders literally as `{{ name }}`, the key is
  missing from `renderVals()` — that is the first thing to check.
- At boot `support.js` replaces `<x-dc>` with `<div id="dc-root">` and renders the
  template into it with React.

### DCLogic gotcha

```js
componentDidUpdate(_prevProps)   // ONE argument. There is no prevState.
```

Writing React's `componentDidUpdate(prevProps, prevState)` throws on every state
update. Track what you need on `this` instead.

---

## Constraints that will bite you

**1. Never inline code inside `<helmet>`.**
The runtime pushes the template through `encodeCamelAttrs()`, a raw-HTML regex
`/(\s)([a-z]+[A-Z][A-Za-z0-9]*)(\s*=)/` meant for attributes like `onClick=`. In
JavaScript, ` isUnsplashHost =` matches it too and becomes
` sc-camel-is-unsplash-host =` — a `SyntaxError` at runtime, invisible in the
source file. The build emits all inlined CSS/JS into `<head>` for this reason and
asserts nothing inlined ends up in `<helmet>`.

**2. Don't let the string `<x-dc>` appear in document text.**
`parseDcText()` finds the template by plain text search. `support.js` contains
`"has no <x-dc> block"` in an error message; once inlined, that literal was found
*before* the real element and the resulting "template" swallowed the module
scripts. The build escapes both literals as `\x3c`, semantically identical, and
asserts the slicer resolves to the real element.

**3. The runtime re-fetches its own HTML — leave it enabled.**
`fetch(location.href)` re-parses the document to supply the template. Seeding
`window.__resources` skips it, but then `#dc-root` renders empty.

**4. `overflow-x: clip`, never `hidden`, on the page wrapper.**
`hidden` makes the wrapper a scroll container and the sticky nav sticks to *it*
instead of the viewport. `clip` clips without creating a scrollport.

**5. Every link is `data-scroll`, not `href`.**
A fragment `href` resolves against the document base URL, which inside a hosted
frame becomes an absolute cross-origin-looking URL that navigates the frame.
`fdc-motion.js` intercepts `[data-scroll]` clicks plus Enter/Space and calls
`scrollIntoView`. Anchors carry `role="link"` and `tabindex="0"` since they have no
`href`. The build asserts zero anchors carry an `href`, and that no `href`/`src`
anywhere holds a non-`data:` URL.

The single exemption is `<link rel="canonical">`. It carries an absolute URL but is
crawler metadata the page never fetches, so it cannot issue a request or navigate a
sandboxed frame. `build.py` strips exactly that tag before the URL scan. Nothing
else gets added to that exemption without the same argument.

**6. Fail visible, never hidden.**
Reveals, the console boot sequence and the back-to-top button all hide content in
JS before showing it. Each has an escape hatch: `initMotion` returns before any
hiding under `prefers-reduced-motion`, CSS `!important` guards back that up, and
the back-to-top button hides *only* when it can prove the reader is near the top of
a document that genuinely scrolls — otherwise it shows. A module failing to load
must leave the page readable.

---

## Canvas renderers

`fdc-adcr.js` exports two drivers:

- `startAdcr(els, opts)` — the four-pane tabbed console. Runs only the visible pane.
- `startPanels(specs, opts)` — several always-on panels.

Both use `makeLoop(cv, build)`, which owns one `requestAnimationFrame` loop that can
be parked, re-fits on resize, `prime()`s one frame so a pane is never blank, and
pauses entirely when the console is off-screen via `IntersectionObserver`.

Available builders: `riskgraph`, `origins`, `radar` (the Autonomous Telemetry
Radar), `impact`, `worldmap`. To add one, write `build(speed, opts)` returning
`{ draw({ctx,w,h}, now) }` and register it in the `builders` map. A scene may also
expose `stop()` for its own listeners.

Renderers must survive a **zero-size measurement**. A canvas measured mid-layout
reports 0×0 and the backing store stays 0 — permanently blank. Every draw loop
re-fits when `!g.w || !g.h`.

---

## Responsive conventions

- `data-r="name"` marks a grid whose columns collapse at breakpoints. Every value
  must have a rule that reaches one or two columns by 375px.
- `data-m-hide` hides an element at ≤760px. Use it for **chrome only** — hiding
  content here removed the whole reference dashboard from mobile at one point.
- `data-tall` marks blocks taller than a phone viewport, reduced at 760/520px.
- `data-boot` staggers a grid's children in as it enters view.
- `data-spot` adds a pointer-tracked glow without the card lift.
- The hero sizes itself `viewport − nav − ticker` via `--fdc-vh` / `--fdc-nav` /
  `--fdc-ticker`, set by `fdc-motion.js`, with a degradation ladder at
  828/800/728/648/508px that drops the caption, then the tagline, then the stats.

**Append new CSS to the *last* `<style>` block.** There are two; the first holds
`@font-face`. Rules added there lose to `!important` rules in the main block.

---

## Forms

Both the contact form and the tour/demo modal go through one method,
`deliver(payload)`, which `POST`s JSON to `FDC_CONTACT_ENDPOINT` with a 12-second
`AbortController` timeout and resolves `{ ok }` rather than throwing — a rejected
promise inside `onSubmit` would leave the reader staring at an unchanged form.

Each form has: `validateLead()` name/email checks, an off-screen honeypot field
named `website` (a bot that fills it gets the ordinary confirmation, so it learns
nothing), a double-submit guard, a `Sending…` button label, and a failure message
naming the relevant desk's address as a fallback. Success and error messages carry
`role="status"` / `role="alert"` with `aria-live`.

**With `FDC_CONTACT_ENDPOINT` unset, both forms still show the reader a reference
number and transmit nothing.** That is the original export's behaviour, kept so the
offline artifact stays request-free — but it means every inquiry is lost. The build
warns about it on every run.

## Head metadata

`title`, `description`, `robots`, `theme-color`, Open Graph, Twitter cards, an
inline-SVG favicon and Organization JSON-LD live in the source `<head>`, above the
`support.js` tag so the build's `head_extra` insertion point and CSS order are
unchanged. They are in `<head>` and **not** `<helmet>` for the reason in constraint
1 — and the JSON-LD is asserted to parse, since stripping a line in URL-free mode
could otherwise leave a trailing comma.

`og:image` expects `og-freedom.jpg` at 1200×630 on the origin. It is not in this
repo; publish it or link previews render an empty box.

## Known state

- No outbound requests except the form `POST`, which fires only on submit and only
  when an endpoint is configured. No `href` attributes on anchors, no `mailto:`,
  no `target="_blank"`.
- The six `reference/adcr-*.png` screenshots are the original console, now rendered
  natively. Nothing references them, and they are 6.9 MB of the repo's 10 MB. They
  bloat every clone forever; move them to Git LFS or out of the repo if that
  matters. The build does not read them.
- `startConsole` in `fdc-visuals.js` is unused, kept as original export surface;
  the build asserts it is not called.
