// node qa_edge_scan.mjs <files...>  -> QA helper (read-only): flags JS syntax that EdgeHTML 18 (Xbox One legacy Edge) can't parse.
// Uses acorn (latest ecmaVersion) + an AST walk. Prints file:line:col  feature. Does not modify anything.
import { createRequire } from 'module'; import fs from 'fs';
const require = createRequire(import.meta.url); const acorn = require('/usr/share/nodejs/acorn/dist/acorn.js');
const hits = []; let total = 0;
for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, 'utf8'); let ast;
  const opts = { ecmaVersion: 'latest', locations: true, allowHashBang: true, allowAwaitOutsideFunction: true };
  try { ast = acorn.parse(src, { ...opts, sourceType: 'module' }); } catch (e) { try { ast = acorn.parse(src, { ...opts, sourceType: 'script' }); } catch (e2) { console.log(`${f}: PARSE ERROR ${e2.message}`); continue; } }
  const add = (n, what) => { hits.push(`${f}:${n.loc.start.line}:${n.loc.start.column + 1}  ${what}`); total++; };
  const walk = (n, fnDepth) => {
    if (!n || typeof n.type !== 'string') return;
    switch (n.type) {
      case 'ChainExpression': add(n, 'optional chaining ?.'); break;
      case 'LogicalExpression': if (n.operator === '??') add(n, 'nullish coalescing ??'); break;
      case 'AssignmentExpression': if (['??=', '||=', '&&='].includes(n.operator)) add(n, 'logical assignment ' + n.operator); break;
      case 'PropertyDefinition': add(n, 'class field'); break;
      case 'PrivateIdentifier': add(n, 'private #field/#method'); break;
      case 'StaticBlock': add(n, 'class static block'); break;
      case 'AwaitExpression': if (fnDepth === 0) add(n, 'top-level await'); break;
      case 'ForOfStatement': if (n.await) add(n, 'for await (async iteration)'); break;
      case 'CatchClause': if (!n.param) add(n, 'optional catch binding catch {}'); break;
      case 'SpreadElement': break;
      case 'ObjectExpression': for (const p of n.properties) if (p.type === 'SpreadElement') add(p, 'object spread {...x}'); break;
      case 'ObjectPattern': for (const p of n.properties) if (p.type === 'RestElement') add(p, 'object rest {...x}'); break;
      case 'ImportExpression': add(n, 'dynamic import()'); break;
      case 'MetaProperty': if (n.meta.name === 'import') add(n, 'import.meta'); break;
      case 'Literal':
        if (typeof n.bigint === 'string') add(n, 'BigInt literal');
        if (typeof n.value === 'number' && /_/.test(n.raw)) add(n, 'numeric separator');
        if (n.regex) { const { pattern, flags } = n.regex;
          if (/\(\?<[=!]/.test(pattern)) add(n, 'regex lookbehind /' + pattern.slice(0, 40) + '/');
          if (/\(\?<[A-Za-z_$]/.test(pattern) || /\\k</.test(pattern)) add(n, 'regex named group');
          if (/s/.test(flags)) add(n, 'regex dotAll /s flag'); if (/\\p\{/.test(pattern)) add(n, 'regex \\p{} unicode property'); if (/d/.test(flags)) add(n, 'regex /d flag'); }
        break;
    }
    if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') { if (n.async && n.generator) add(n, 'async generator'); fnDepth++; }
    for (const k in n) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach((c) => walk(c, fnDepth)); else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, fnDepth); }
  };
  walk(ast, 0);
}
console.log(hits.join('\n')); console.log(`TOTAL ${total} flagged`);
