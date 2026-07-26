"""Flatten the Freedom Data Center design export into one self-contained file.

Source of truth is ./src (edit there, then run: python3 build.py).
Three things have to be neutralised for the page to run offline / in a sandboxed
iframe:
  1. React + ReactDOM come from unpkg  -> vendored from npm, so the runtime's
     loadReactUmd() short-circuits on window.React.
  2. The two visual modules are loaded via dynamic import() of relative paths ->
     rewritten to a global registry. Blob URLs would also work on file:// but get
     blocked by the CSP on preview iframes, and the original .catch() swallowed
     the error, so every canvas went silently dead.
  3. Images are relative paths -> inlined as data URIs.
Babel is deliberately NOT vendored: the component has no JSX and there are no
x-import tags, so ensureBabel() is never reached.
"""

import base64, mimetypes, os, pathlib, re, json

ROOT   = pathlib.Path(__file__).resolve().parent
SRC    = ROOT / 'src'
VENDOR = ROOT / 'vendor'
DS     = SRC / '_ds' / 'nocturne-030bdd51-f4d4-40aa-a29e-f2ded65371c5'
OUT    = ROOT / 'dist' / 'freedom-data-center.html'

# ---- 0. deployment configuration --------------------------------------------
# Two values the source cannot know. Both are substituted into the placeholders
# in src/*.dc.html, and the build asserts afterwards that no placeholder survived
# (a stale __SITE_URL__ in a canonical tag is invisible until a crawler sees it).
#
#   FDC_SITE_URL          public origin; canonical, og:url, og:image, JSON-LD.
#                         Set empty to strip every URL-bearing metadata line and
#                         keep the artifact totally URL-free.
#   FDC_CONTACT_ENDPOINT  URL accepting a JSON POST from the two forms. Empty
#                         means both forms confirm on-page and deliver NOWHERE.
PLACEHOLDER_ORIGIN = 'https://freedomdatacenter.com'
SITE_URL         = os.environ.get('FDC_SITE_URL', PLACEHOLDER_ORIGIN).rstrip('/')
CONTACT_ENDPOINT = os.environ.get('FDC_CONTACT_ENDPOINT', '').strip()

read = lambda p: pathlib.Path(p).read_text(encoding='utf-8')
html = read(SRC / 'Freedom Data Center.dc.html')

if SITE_URL:
    html = html.replace('__SITE_URL__', SITE_URL)
else:
    # Strip the URL-bearing metadata, and the og:image dimension/alt lines with
    # it -- they are meaningless without the og:image they describe.
    drop = lambda l: '__SITE_URL__' in l or 'og:image:' in l or 'twitter:card' in l
    html = '\n'.join(l for l in html.split('\n') if not drop(l))
html = html.replace('__CONTACT_ENDPOINT__', CONTACT_ENDPOINT)

print('site url          %s' % (SITE_URL or '(none — URL-free build)'))
print('contact endpoint  %s' % (CONTACT_ENDPOINT or '(none — forms deliver nowhere)'))


def swap(tag, replacement):
    """Replace exactly one known tag, loudly if it has moved."""
    global html
    assert html.count(tag) == 1, 'anchor not unique/found: %r' % tag[:60]
    html = html.replace(tag, replacement, 1)


# ---- 1. design-system css + bundle + image-slot helper -----------------------
# These three live inside <helmet>, which the runtime pushes through
# encodeCamelAttrs() -- a raw-HTML regex /(\s)([a-z]+[A-Z][A-Za-z0-9]*)(\s*=)/
# meant for attributes like onClick=. Inlined JS trips it: ` isUnsplashHost =`
# becomes ` sc-camel-is-unsplash-host =` and the script dies with a SyntaxError.
# So strip the tags from <helmet> and re-emit the code in <head> instead, which
# the encoder never touches. Order is preserved: styles.css still precedes the
# page's own <style> once helmet is hoisted, so the cascade is unchanged.
head_extra = ('<style>\n/* inlined: styles.css */\n%s\n</style>\n'
              % read(DS / 'styles.css'))
head_extra += ('<script>\n/* inlined: _ds_bundle.js */\n%s\n</script>\n'
               % read(DS / '_ds_bundle.js'))
head_extra += ('<script>\n/* inlined: image-slot.js */\n%s\n</script>\n'
               % read(SRC / 'image-slot.js'))

swap('<link rel="stylesheet" href="_ds/nocturne-030bdd51-f4d4-40aa-a29e-f2ded65371c5/styles.css">', '')
swap('<script src="_ds/nocturne-030bdd51-f4d4-40aa-a29e-f2ded65371c5/_ds_bundle.js"></script>', '')
swap('<script src="./image-slot.js"></script>', '')


# ---- 2. ES modules -> classic scripts on a global registry -------------------
def to_classic(name, src):
    exported = []

    def take(m):
        exported.append(m.group(2))
        return m.group(1) + m.group(2)

    src = re.sub(r'\bexport\s+(function\s+)(\w+)', take, src)
    src = re.sub(r'\bexport\s+((?:const|let|var)\s+)(\w+)', take, src)

    def take_list(m):
        exported.extend(n.strip() for n in m.group(1).split(',') if n.strip())
        return ''

    src = re.sub(r'\bexport\s*\{([^}]*)\}\s*;?', take_list, src)
    stripped = re.sub(r'//[^\n]*|/\*.*?\*/', '', src, flags=re.S)
    assert 'export' not in stripped, 'unhandled export syntax in ' + name
    exported = list(dict.fromkeys(exported))
    tag = ('<script>\n/* module: %s */\n(function(){\n%s\n'
           'window.__fdcModules = window.__fdcModules || {};\n'
           'window.__fdcModules[%s] = {%s};\n})();\n</script>\n'
           % (name, src, json.dumps(name), ','.join(exported)))
    return exported, tag


MODULES = ['./fdc-motion.js', './fdc-visuals.js', './fdc-adcr.js']
module_tags = ''
for name in MODULES:
    names, tag = to_classic(name, read(SRC / name.lstrip('./')))
    module_tags += tag
    print('module %-18s exports: %s' % (name, ', '.join(names)))

shim = """<script>
window.__fdcImport = function (name) {
  var m = (window.__fdcModules || {})[name];
  return m ? Promise.resolve(m)
           : Promise.reject(new Error('fdc module not registered: ' + name));
};
</script>
"""

react_tags = ''
for lib in ('react/umd/react.production.min.js',
            'react-dom/umd/react-dom.production.min.js'):
    react_tags += '<script>\n/* vendored: %s */\n%s\n</script>\n' % (lib, read(VENDOR / lib))

# The runtime re-reads its own HTML over the network and hot-swaps the template:
#     if (!window.__resources) { fetch(location.href) ... parseDcText(t) ... }
# parseDcText slices the template with /<x-dc(?:\s[^>]*)?>/ on raw text. Inlining
# support.js put its own error-message literal "has no <x-dc> block" INTO the
# document, so that slice starts at the comment rather than the real element and
# swallows the module <script>s. They then get camel-encoded and re-appended,
# which throws "Missing initializer in const declaration" from appendChild.
# The refetch cannot simply be disabled: it is what supplies the template (with
# __resources seeded, #dc-root renders empty). The fix is to escape the stray
# literals so the slicer lands on the real element again.
support_js = read(SRC / 'support.js')
for stray, safe in ((r'/<x-dc(?:\s[^>]*)?>/', r'/\x3cx-dc(?:\s[^>]*)?>/'),
                    ('has no <x-dc> block', r'has no \x3cx-dc> block')):
    assert support_js.count(stray) == 1, 'stray x-dc literal moved: %r' % stray
    support_js = support_js.replace(stray, safe, 1)

swap('<script src="./support.js"></script>',
     head_extra
     + react_tags
     + '<script>\n/* inlined: support.js */\n%s\n</script>\n' % support_js
     + shim + module_tags)

for name in MODULES:
    before = html.count("import('%s')" % name)
    html = html.replace("import('%s')" % name, "window.__fdcImport('%s')" % name)
    assert before, 'no import() call site found for ' + name


# ---- 3. images + fonts -> data URIs -----------------------------------------
for ref in sorted(set(re.findall(r'(?:assets|fonts)/[A-Za-z0-9._-]+', html))):
    f = SRC / ref
    assert f.exists(), 'missing asset: ' + ref
    mime = ('font/woff2' if f.suffix == '.woff2'
            else mimetypes.guess_type(f.name)[0] or 'application/octet-stream')
    n = html.count(ref)
    html = html.replace(
        ref, 'data:%s;base64,%s' % (mime, base64.b64encode(f.read_bytes()).decode()))
    print('inline %-34s %6.0f KB  x%d' % (ref, f.stat().st_size / 1024, n))

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(html, encoding='utf-8')


# ---- 4. verify --------------------------------------------------------------
print('\noutput %.1f MB' % (OUT.stat().st_size / 1048576))
checks = [
    (False, 'src="./support.js"',                  'support.js inlined'),
    (False, '_ds_bundle.js"',                      'ds bundle inlined'),
    (False, 'assets/',                             'all asset paths resolved'),
    (False, 'fonts/inter',                         'fonts inlined'),
    (False, 'fonts.googleapis.com',                'no Google Fonts'),
    (False, 'fonts.gstatic.com',                   'no gstatic preconnect'),
    (False, 'mailto:',                             'no mailto links'),
    (False, "import('./fdc",                       'dynamic imports rewritten'),
    (False, 'createObjectURL(new Blob',            'no blob loader'),
    (True,  'ReactDOM',                            'React vendored'),
    (True,  '__resourceBlobs',                     'dc runtime intact'),
    (True,  '"./fdc-visuals.js"] = {',             'visuals registered'),
    (True,  '"./fdc-motion.js"] = {',              'motion registered'),
    (True,  'a.startAdcr(',                        'ADCR console wired'),
    (True,  "build: 'riskgraph'",                   'risk correlation graph wired'),
    (True,  "build: 'worldmap'",                    'coastline map wired'),
    (False, 'v.startConsole(',                      'crude startConsole not used'),
    (False, 'buildSubgraph',                        'anonymous node mesh retired'),
    (True,  "focus: 'detection'",                   'detection pane on the real graph'),
    (True,  '"./fdc-adcr.js"] = {',               'adcr module registered'),
    (True,  'adcrSubgraph: this.adcrSubgraph',     'adcr refs exposed'),
    (False, 'mapCanvas',                           'duplicate map panel removed'),
    (False, 'graphCanvas',                         'duplicate graph panel removed'),
    (True,  'ref="{{ uniGraph }}"',                'unified graph canvas present'),
    (True,  'data-dc-script',                      'component script present'),
]
hs, he = html.index('<helmet>'), html.index('</helmet>')
inline_in_helmet = [m for m in re.finditer(r'/\* (?:inlined|vendored|module): ([^*]+?) \*/', html)
                    if hs < m.start() < he]
checks.append((True, 'sc-camel', 'runtime encoder present'))
checks.append((True, 'onNavClick', 'in-page navigation handled'))
checks.append((True, 'data-boot', 'console boot sequence wired'))
checks.append((True, 'data-spot', 'pointer spotlight wired'))
checks.append((True, 'id="fdc-totop"', 'back-to-top overlay present'))
checks.append((True, 'uniMapLegend', 'heat map legend wired'))
checks.append((True, 'uniRadarLegend', 'radar legend wired'))
checks.append((True, 'adcrLegendOrder', 'per-pane ADCR legends wired'))
checks.append((True, 'fdc-totop-ring', 'scroll progress ring wired'))
checks.append((False, 'overflow-x:hidden"', 'sticky nav not broken by overflow'))
checks.append((True, 'data-scroll', 'scroll targets present'))
checks.append((False, 'target="_blank"', 'no new-tab links'))

# --- metadata + form delivery -------------------------------------------------
# Every one of these shipped missing at some point. The head was completely bare
# on first export -- no title, no lang, no cards -- and both forms generated a
# reference number for an inquiry that was never transmitted anywhere.
checks.append((False, '__SITE_URL__',        'site-url placeholder substituted'))
checks.append((False, '__CONTACT_ENDPOINT__', 'contact-endpoint placeholder substituted'))
checks.append((True,  '<title>',             'document title present'))
checks.append((True,  'lang="en"',           'document language declared'))
checks.append((True,  'name="description"',  'meta description present'))
checks.append((bool(SITE_URL), 'property="og:image"', 'social card image present'))
checks.append((True,  'application/ld+json', 'organization structured data present'))
checks.append((True,  'rel="icon"',          'favicon present'))
checks.append((True,  'name="website"',      'form honeypots present'))
checks.append((True,  'await this.deliver(', 'forms use the shared delivery path'))
checks.append((True,  '{{ contactError }}',  'contact failure reaches the reader'))
checks.append((True,  '{{ modalError }}',    'modal failure reaches the reader'))
checks.append((True,  'contactSubmitLabel',  'send-in-progress state wired'))
checks.append((True,  'aria-live',           'form results announced to screen readers'))

# no element in the document may carry a URL at all -- with one exception:
# <link rel="canonical"> is crawler metadata that the page never fetches, so it
# cannot cause an outbound request or navigate a sandboxed frame. Exempt exactly
# that tag; every other href/src must still be a data: URI or absent.
anchors = re.findall(r'<a\b[^>]*>', html)
with_href = [a for a in anchors if 'href=' in a]
outbound = with_href
print(('ok    ' if not with_href else 'FAIL  ')
      + 'zero anchors carry an href (%d anchors checked)' % len(anchors))
leftover_scan = re.sub(r'<link rel="canonical" href="[^"]*">', '', html)
leftover = sorted(set(re.findall(r'<[a-z]+\b[^>]*\b(?:href|src)="((?!data:)[^"]*)"', leftover_scan)))
print(('ok    ' if not leftover else 'FAIL  ')
      + 'no URL-bearing attributes remain (' + (', '.join(leftover)[:60] or 'clean') + ')')
outbound = outbound or leftover

# the runtime's own slicer must land on the real <x-dc>, not on a text literal
rt = re.search(r'<x-dc(?:\s[^>]*)?>', html)
real = html.index('<x-dc>\n<helmet>')
stray_ok = rt is not None and rt.start() == real
print(('ok    ' if stray_ok else 'FAIL  ')
      + 'runtime template slice resolves to the real <x-dc> (offset %d vs %d)'
      % (rt.start() if rt else -1, real))

bad = 0
for want, needle, label in checks:
    ok = (needle in html) == want
    bad += not ok
    print(('ok    ' if ok else 'FAIL  ') + label)
print(('ok    ' if not inline_in_helmet else 'FAIL  ')
      + 'no inlined code inside <helmet> ('
      + (', '.join(m.group(1).strip() for m in inline_in_helmet) or 'clean') + ')')
bad += bool(inline_in_helmet) + (not stray_ok) + bool(outbound)

# structured data must parse -- a stripped JSON-LD line can leave a trailing comma
ld = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
try:
    json.loads(ld.group(1)); ld_ok = True
except Exception as exc:
    ld_ok = False; print('       json-ld error: %s' % exc)
print(('ok    ' if ld_ok else 'FAIL  ') + 'JSON-LD parses')
bad += not ld_ok

print('\n%d/%d checks passed' % (len(checks) + 4 - bad, len(checks) + 4))

# Not assertions -- these are launch blockers the build cannot decide for you.
warn = []
if SITE_URL == PLACEHOLDER_ORIGIN:
    warn.append('FDC_SITE_URL is the placeholder %s -- canonical, og:url and og:image\n'
                '        all point at a domain you may not own. Social previews and\n'
                '        canonicalisation will be wrong.' % PLACEHOLDER_ORIGIN)
if not CONTACT_ENDPOINT:
    warn.append('FDC_CONTACT_ENDPOINT is unset -- both forms confirm to the reader with\n'
                '        a reference number and transmit nothing. Every inquiry is lost.')
if SITE_URL:
    warn.append('og:image expects %s/og-freedom.jpg at 1200x630. Publish it or\n'
                '        link previews render as an empty box.' % SITE_URL)
for w in warn:
    print('\nWARN  ' + w)
