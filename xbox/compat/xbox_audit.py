#!/usr/bin/env python3
"""xbox_audit.py - static EdgeHTML 18 (Xbox One Dev Mode, legacy UWP JS app) compatibility audit. Read-only.

Usage:  python3 xbox_audit.py <game-folder> [<more folders/files>...] [--json] [--out REPORT.txt]
                [--exclude GLOB ...] [--max-per-rule N] [--no-node] [--include-bak]

Flags (by category):
  webgl2  WebGL2-only API / GLSL ES 3.00 (EdgeHTML 18 is WebGL1 only).
  html    inline <script> blocks, inline on*= event handlers, javascript: URLs, importmaps, module scripts.
  ogg     .ogg/.oga/.opus files and references (EdgeHTML can't decode Ogg/Opus; use MP3/AAC).
  fetch   fetch() calls (on ms-appx package files use XHR instead).
  syntax  JS syntax newer than ~ES2017 (acorn AST walk via node if available, else regex heuristics),
          plus a strict acorn ecmaVersion-2017 parse per file as ground truth.
  api     runtime APIs EdgeHTML 18 lacks (flat/flatMap/fromEntries/globalThis/...); WARN unless shimmed.
Severity: BLOCKER (will not parse / will not work), WARN (likely problem or guarded path; check), INFO.
Exit code: 1 if any BLOCKER, 0 otherwise, 2 on usage error.
Python 3 stdlib only. JS parsing uses a node + acorn already on the box (no installs); falls back to regex.
"""
import argparse, fnmatch, json, os, re, shutil, subprocess, sys, time
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
JS_EXT = {'.js', '.mjs', '.cjs'}
HTML_EXT = {'.html', '.htm'}
GLSL_EXT = {'.glsl', '.vert', '.frag', '.vs', '.fs'}
TEXT_EXT = JS_EXT | HTML_EXT | GLSL_EXT | {'.css', '.json', '.xml', '.webmanifest'}
OGG_EXT = {'.ogg', '.oga', '.opus', '.weba'}
DEFAULT_EXCLUDES = ['*/node_modules/*', '*/.git/*', '*/.venv/*', '*/__pycache__/*']
BAK_RE = re.compile(r'\.bak|~$|\.orig$')
MAX_TEXT = 25 * 1024 * 1024
SEV_ORDER = {'BLOCKER': 0, 'WARN': 1, 'INFO': 2}
CATS = ['webgl2', 'html', 'ogg', 'fetch', 'syntax', 'api', 'parse']

# ---------------- WebGL2 rules ----------------
WEBGL1_FALLBACK = re.compile(r"""getContext\(\s*['"](?:experimental-)?webgl['"]|['"]experimental-webgl['"]|\[\s*['"]webgl2['"]\s*,\s*['"]webgl['"]""")
WEBGL2_RULES = [
    (re.compile(r"""getContext\(\s*['"]webgl2['"]"""), "getContext('webgl2')"),
    (re.compile(r"""(?<!getContext\()['"]webgl2['"]"""), "'webgl2' context name string (e.g. in a context-name list)"),
    (re.compile(r'\bWebGL2RenderingContext\b'), 'WebGL2RenderingContext'),
    (re.compile(r'\b(?:texImage3D|texSubImage3D|compressedTexImage3D|compressedTexSubImage3D|copyTexSubImage3D|texStorage[23]D)\b'), '3D/immutable texture API (texImage3D/texStorage*)'),
    (re.compile(r'\b(?:createVertexArray|bindVertexArray|deleteVertexArray)\b'), 'native VAO (createVertexArray) - WebGL1 needs OES_vertex_array_object (...OES)'),
    (re.compile(r'\b(?:drawArraysInstanced|drawElementsInstanced|vertexAttribDivisor)\b'), 'native instancing - WebGL1 needs ANGLE_instanced_arrays (...ANGLE)'),
    (re.compile(r'\bdrawBuffers\b'), 'drawBuffers - WebGL1 needs WEBGL_draw_buffers (drawBuffersWEBGL)'),
    (re.compile(r'\b(?:blitFramebuffer|renderbufferStorageMultisample|invalidateFramebuffer|readBuffer|clearBuffer[fiu]v?|clearBufferfi)\b'), 'WebGL2 framebuffer API (blit/MSAA renderbuffer/clearBuffer)'),
    (re.compile(r'\b(?:createSampler|bindSampler|samplerParameter[if]|createQuery|beginQuery|createTransformFeedback|beginTransformFeedback|fenceSync|clientWaitSync|getBufferSubData|copyBufferSubData)\b'), 'WebGL2 sampler/query/transform-feedback/sync/buffer API'),
    (re.compile(r'\b(?:getUniformBlockIndex|uniformBlockBinding|bindBufferBase|bindBufferRange|getActiveUniformBlock\w*)\b'), 'uniform buffer objects (UBO)'),
    (re.compile(r'\buniform[1-4]uiv?\b|\buniformMatrix[234]x[234]fv\b|\bvertexAttribI(?:Pointer|4i|4ui)\w*\b'), 'WebGL2 integer/non-square uniforms or attribs'),
    (re.compile(r'#version\s+300\s+es'), "GLSL '#version 300 es' (WebGL1 = GLSL ES 1.00)"),
    (re.compile(r'\b(?:sampler3D|sampler2DArray|[iu]sampler(?:2D|3D|Cube|2DArray))\b'), 'GLSL ES 3.00 sampler types'),
    (re.compile(r'\btexelFetch\s*\(|\btextureLod\s*\(|\blayout\s*\(\s*location'), 'GLSL ES 3.00 builtins/layout qualifiers'),
]
OGG_REF = re.compile(r"""\.(?:ogg|oga|opus)\b|audio/ogg|codecs\s*=\s*["']?(?:vorbis|opus)""", re.I)
OGG_ALT = re.compile(r'\.mp3\b|\.m4a\b|\.aac\b|canPlayType', re.I)
GUARD_HINT = re.compile(r'isWebGL2|typeof\s+WebGL2RenderingContext|instanceof\s+WebGL2RenderingContext')

# --------------- regex fallback for JS syntax (used only without node/acorn) ---------------
FALLBACK_SYNTAX = [
    (re.compile(r'\?\.(?!\d)'), 'BLOCKER', 'optional chaining ?. (regex)'),
    (re.compile(r'\?\?=?'), 'BLOCKER', 'nullish ?? / ??= (regex)'),
    (re.compile(r'\|\|=|&&='), 'BLOCKER', 'logical assignment (regex)'),
    (re.compile(r'(?<![\w$])\d[\d_]*_\d'), 'BLOCKER', 'numeric separator (regex)'),
    (re.compile(r'(?<![\w$.])\d+n\b'), 'BLOCKER', 'BigInt literal (regex)'),
    (re.compile(r'(?<![\w$.])import\s*\('), 'BLOCKER', 'dynamic import() (regex)'),
    (re.compile(r'import\.meta'), 'BLOCKER', 'import.meta (regex)'),
    (re.compile(r'\(\?<[=!]'), 'BLOCKER', 'regex lookbehind (regex)'),
    (re.compile(r'\(\?<[A-Za-z_$]'), 'BLOCKER', 'regex named group (regex)'),
    (re.compile(r'(?<![\w$"\'])#[A-Za-z_$][\w$]*\s*(?:[=;(]|in\b)'), 'BLOCKER', 'private #field (regex)'),
    (re.compile(r'\bcatch\s*\{'), 'BLOCKER', 'optional catch binding (regex)'),
    (re.compile(r'\{\s*\.\.\.|,\s*\.\.\.[\w$]+\s*\}'), 'WARN', 'possible object spread/rest (regex)'),
    (re.compile(r'\bfor\s+await\b'), 'BLOCKER', 'for await (regex)'),
]
FALLBACK_API = [
    (re.compile(r'\.(?:flat|flatMap)\s*\('), 'Array.prototype.flat/flatMap'),
    (re.compile(r'\bObject\.fromEntries\b'), 'Object.fromEntries'),
    (re.compile(r'\.(?:matchAll|replaceAll)\s*\('), 'matchAll/replaceAll'),
    (re.compile(r'\bPromise\.(?:allSettled|any)\b'), 'Promise.allSettled/any'),
    (re.compile(r'\bglobalThis\b'), 'globalThis'),
]
FETCH_RE = re.compile(r'(?<![\w$.])(?:window\.|self\.)?fetch\s*\(\s*([\'"`]?)([^\'"`),]*)')


def strip_js_noise(line):
    """Crude: blank out string literals and // comments so regex fallback has fewer false hits."""
    line = re.sub(r'//.*$', '', line)
    return re.sub(r"""(['"])(?:\\.|(?!\1).)*\1""", '""', line)


class Finding(dict):
    pass


def F(path, line, col, cat, sev, msg, root):
    rel = os.path.relpath(path, root) if root and not path.startswith('<') else path
    vendor = bool(re.search(r'(^|/)(vendor|node_modules|lib)/|three(\.module|\.core|\.min)?\.js$', rel))
    return {'file': rel, 'abs': path, 'line': line, 'col': col, 'cat': cat, 'sev': sev, 'msg': msg, 'vendor': vendor}


class HtmlScan(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.items = []      # (line, col, sev, msg)
        self.inline = []     # (line0, code, is_module)
        self._in_script = None

    def handle_starttag(self, tag, attrs):
        line, col = self.getpos()
        a = {k.lower(): (v or '') for k, v in attrs}
        for k, v in attrs:
            k = k.lower()
            if k.startswith('on') and len(k) > 2:
                self.items.append((line, col + 1, 'BLOCKER', f'inline event handler <{tag} {k}="{(v or "")[:50]}">'))
            if k in ('href', 'src', 'action') and (v or '').strip().lower().startswith('javascript:'):
                self.items.append((line, col + 1, 'BLOCKER', f'javascript: URL in <{tag} {k}>'))
        if tag == 'script':
            t = a.get('type', '').strip().lower()
            if t == 'importmap':
                self.items.append((line, col + 1, 'BLOCKER', '<script type="importmap"> (not supported by EdgeHTML 18)'))
            elif t == 'module' and 'src' in a:
                self.items.append((line, col + 1, 'WARN', f'<script type="module" src="{a["src"]}"> - EdgeHTML 18 has basic ES modules, but the legacy package should load a bundled classic script'))
            self._in_script = {'line': line, 'col': col, 'src': 'src' in a, 'type': t, 'buf': [], 'data_line': None}

    def handle_data(self, data):
        if self._in_script is not None:
            if self._in_script['data_line'] is None:
                self._in_script['data_line'] = self.getpos()[0]
            self._in_script['buf'].append(data)

    def handle_endtag(self, tag):
        if tag == 'script' and self._in_script is not None:
            s = self._in_script; code = ''.join(s['buf']); self._in_script = None
            nonjs = s['type'] not in ('', 'module', 'text/javascript', 'application/javascript', 'text/ecmascript')
            if code.strip() and not s['src'] and not nonjs:
                n = code.count('\n') + 1
                self.items.append((s['line'], s['col'] + 1, 'BLOCKER', f'inline <script> block ({n} lines, {len(code)} chars) - UWP ms-appx pages did not run inline script (1.0.0.0); move to an external .js'))
                self.inline.append((s['data_line'] - 1, code, s['type'] == 'module'))


def find_node():
    for c in ('node', 'nodejs'):
        p = shutil.which(c)
        if p:
            return p
    return None


def run_ast(jobs, node):
    helper = os.path.join(HERE, 'js_ast_scan.js')
    if not node or not os.path.exists(helper) or not jobs:
        return None
    try:
        r = subprocess.run([node, '--max-old-space-size=4096', helper], input=json.dumps(jobs), capture_output=True, text=True, timeout=600)
        data = json.loads(r.stdout or '{}')
        return data if data.get('parser') else None
    except Exception as e:  # noqa
        sys.stderr.write(f'node/acorn helper failed: {e}\n')
        return None


def collect(targets, excludes, include_bak):
    files = []
    for t in targets:
        t = os.path.abspath(t)
        if os.path.isfile(t):
            files.append((t, os.path.dirname(t))); continue
        for dp, dns, fns in os.walk(t):
            dns[:] = [d for d in dns if not any(fnmatch.fnmatch(os.path.join(dp, d) + '/', g) or fnmatch.fnmatch(os.path.join(dp, d) + '/x', g) for g in excludes)]
            for fn in fns:
                p = os.path.join(dp, fn)
                if any(fnmatch.fnmatch(p, g) for g in excludes):
                    continue
                if not include_bak and BAK_RE.search(fn):
                    continue
                files.append((p, t))
    return files


def audit(targets, excludes, include_bak=False, use_node=True):
    findings, jobs, meta = [], [], {}
    files = collect(targets, excludes, include_bak)
    stats = {'files_scanned': 0, 'js_files': 0, 'html_files': 0, 'inline_scripts': 0}
    for path, root in files:
        ext = os.path.splitext(path)[1].lower()
        if ext in OGG_EXT:
            findings.append(F(path, 0, 0, 'ogg', 'WARN', f'{ext} audio file in folder ({os.path.getsize(path)//1024} KB) - EdgeHTML cannot decode it; ship MP3/AAC instead (BLOCKER only if referenced)', root))
            continue
        if ext not in TEXT_EXT or os.path.getsize(path) > MAX_TEXT:
            continue
        try:
            text = open(path, encoding='utf-8', errors='replace').read()
        except OSError:
            continue
        stats['files_scanned'] += 1
        lines = text.split('\n')
        is_js, is_html, is_glsl = ext in JS_EXT, ext in HTML_EXT, ext in GLSL_EXT
        if is_html:
            stats['html_files'] += 1
            h = HtmlScan()
            try:
                h.feed(text); h.close()
            except Exception as e:
                findings.append(F(path, 1, 1, 'html', 'WARN', f'HTML parse problem: {e}', root))
            for (ln, col, sev, msg) in h.items:
                findings.append(F(path, ln, col, 'html', sev, msg, root))
            for (line0, code, is_mod) in h.inline:
                stats['inline_scripts'] += 1
                jobs.append({'id': f'{path}::{line0}', 'path': path, 'root': root, 'code': code, 'line0': line0, 'module': is_mod})
        if is_js:
            stats['js_files'] += 1
            jobs.append({'id': path, 'path': path, 'root': root, 'code': text, 'line0': 0, 'module': ext == '.mjs'})
        # ---- line-based rules: WebGL2, OGG (all code files) ----
        if is_js or is_html or is_glsl:
            has_fb = bool(WEBGL1_FALLBACK.search(text))
            guarded = bool(GUARD_HINT.search(text))
            for i, ln in enumerate(lines, 1):
                for rx, what in WEBGL2_RULES:
                    for m in rx.finditer(ln):
                        if has_fb or guarded:
                            sev, note = 'WARN', ' [file also has a WebGL1 path / isWebGL2 guard: likely a guarded branch]'
                        else:
                            sev, note = 'BLOCKER', ''
                        if is_glsl and what.startswith("GLSL '#version"):
                            sev, note = 'BLOCKER', ''
                        findings.append(F(path, i, m.start() + 1, 'webgl2', sev, what + note, root))
                for m in OGG_REF.finditer(ln):
                    alt = OGG_ALT.search(ln)
                    findings.append(F(path, i, m.start() + 1, 'ogg', 'WARN' if alt else 'BLOCKER',
                                      f'Ogg/Opus reference "{ln[max(0, m.start()-30):m.end()+10].strip()[:80]}"' + (' [MP3/canPlayType alternative on same line]' if alt else ''), root))
    # ---- JS AST pass (node + acorn), else regex fallback ----
    ast = run_ast([{'id': j['id'], 'code': j['code'], 'line0': j['line0'], 'module': j['module']} for j in jobs], find_node() if use_node else None)
    meta['parser'] = ast['parser'] if ast else 'regex fallback (no node/acorn)'
    for j in jobs:
        if ast:
            r = ast['results'].get(j['id'], {})
            for f in r.get('findings', []):
                findings.append(F(j['path'], f['line'], f['col'], f['cat'], f['sev'], f['msg'], j['root']))
            if r.get('parseError'):
                pe = r['parseError']
                findings.append(F(j['path'], pe['line'], pe['col'], 'parse', 'BLOCKER', 'does not parse even as latest JS: ' + re.sub(r'\s*\(\d+:\d+\)$', '', pe['msg']), j['root']))
            p17 = r.get('parse2017')
            if isinstance(p17, dict):
                findings.append(F(j['path'], p17['line'], p17['col'], 'parse', 'BLOCKER', 'strict ES2017 parse fails here (first error only): ' + re.sub(r'\s*\(\d+:\d+\)$', '', p17['msg']), j['root']))
        else:
            for i, ln in enumerate(j['code'].split('\n'), 1 + j['line0']):
                s = strip_js_noise(ln)
                for rx, sev, msg in FALLBACK_SYNTAX:
                    for m in rx.finditer(s):
                        findings.append(F(j['path'], i, m.start() + 1, 'syntax', sev, msg, j['root']))
                for rx, msg in FALLBACK_API:
                    for m in rx.finditer(s):
                        findings.append(F(j['path'], i, m.start() + 1, 'api', 'WARN', msg + ' (regex)', j['root']))
                for m in FETCH_RE.finditer(ln):
                    q, url = m.group(1), m.group(2)
                    sev = 'WARN' if (not q or re.match(r'(https?:)?//', url)) else 'BLOCKER'
                    findings.append(F(j['path'], i, m.start() + 1, 'fetch', sev, f'fetch({q}{url[:50]}{q}) (regex)', j['root']))
    findings.sort(key=lambda f: (CATS.index(f['cat']) if f['cat'] in CATS else 99, SEV_ORDER[f['sev']], f['file'], f['line'], f['col']))
    meta.update(stats)
    return findings, meta


def summarize(findings):
    s = {}
    for f in findings:
        c = s.setdefault(f['cat'], {'BLOCKER': 0, 'WARN': 0, 'INFO': 0})
        c[f['sev']] += 1
    return s


def render_text(targets, findings, meta, max_per_rule):
    out = []
    w = out.append
    w('Xbox One EdgeHTML 18 static compat audit (xbox_audit.py)')
    w(f'Run: {time.strftime("%Y-%m-%d %H:%M %Z")}   Targets: ' + ', '.join(targets))
    w(f'JS parser: {meta["parser"]}   files scanned: {meta["files_scanned"]} (js {meta["js_files"]}, html {meta["html_files"]}, inline scripts {meta["inline_scripts"]})')
    w('Severity: BLOCKER = will not parse/run on EdgeHTML 18 as-is; WARN = check (often a guarded branch or fallback); INFO = fine.')
    w('[vendor] = third-party code (three.js etc.). Static analysis only: says nothing about how it runs on the console.')
    w('')
    summ = summarize(findings)
    w('SUMMARY (BLOCKER / WARN / INFO)')
    for c in CATS:
        if c in summ:
            v = summ[c]; w(f'  {c:7s} {v["BLOCKER"]:5d} / {v["WARN"]:5d} / {v["INFO"]:5d}')
    tb = sum(v['BLOCKER'] for v in summ.values())
    w(f'  TOTAL BLOCKERS: {tb}')
    w('')
    for c in CATS:
        fs = [f for f in findings if f['cat'] == c]
        if not fs:
            continue
        w(f'== {c.upper()} ==')
        groups = {}
        for f in fs:
            groups.setdefault((f['sev'], f['file'], f['msg']), []).append(f)
        for (sev, file, msg), g in sorted(groups.items(), key=lambda kv: (SEV_ORDER[kv[0][0]], kv[0][1], kv[1][0]['line'])):
            locs = ', '.join(f'{x["line"]}:{x["col"]}' for x in g[:max_per_rule]) + (f', ... (+{len(g)-max_per_rule} more)' if len(g) > max_per_rule else '')
            vend = ' [vendor]' if g[0]['vendor'] else ''
            w(f'  [{sev}] {file}:{locs}{vend}  x{len(g)}  {msg}')
        w('')
    return '\n'.join(out) + '\n'


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('targets', nargs='+')
    ap.add_argument('--json', action='store_true', help='print JSON instead of text')
    ap.add_argument('--out', help='also write the text report to this file')
    ap.add_argument('--exclude', action='append', default=[], help='glob on absolute path (repeatable)')
    ap.add_argument('--max-per-rule', type=int, default=8)
    ap.add_argument('--no-node', action='store_true', help='skip node/acorn; regex heuristics only')
    ap.add_argument('--include-bak', action='store_true', help='also scan *.bak* files')
    a = ap.parse_args()
    for t in a.targets:
        if not os.path.exists(t):
            sys.stderr.write(f'no such path: {t}\n'); sys.exit(2)
    findings, meta = audit(a.targets, DEFAULT_EXCLUDES + a.exclude, a.include_bak, not a.no_node)
    text = render_text(a.targets, findings, meta, a.max_per_rule)
    if a.out:
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        open(a.out, 'w', encoding='utf-8').write(text)
    if a.json:
        print(json.dumps({'targets': a.targets, 'meta': meta, 'summary': summarize(findings),
                          'blockers': sum(1 for f in findings if f['sev'] == 'BLOCKER'),
                          'findings': [{k: v for k, v in f.items() if k != 'abs'} for f in findings]}, indent=1))
    else:
        sys.stdout.write(text)
    sys.exit(1 if any(f['sev'] == 'BLOCKER' for f in findings) else 0)


if __name__ == '__main__':
    main()
