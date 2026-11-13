#!/usr/bin/env node
// AST scan for xbox_audit.py. Reads a JSON job list on stdin and writes
// {parser, results} on stdout. Syntax newer than ES2017 is reported here;
// a failed ecmaVersion:2017 parse is the ground truth (parse2017).
'use strict';
const fs = require('fs');
const path = require('path');

function loadAcorn() {
  const local = path.join(__dirname, '..', 'node_modules', 'acorn');
  try { return require(local); } catch (e) { return require('acorn'); }
}

const acorn = loadAcorn();

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

function locOf(node, line0) {
  const line = (node.loc && node.loc.start.line ? node.loc.start.line : 1) + (line0 || 0);
  const col = node.loc && node.loc.start.column != null ? node.loc.start.column + 1 : 1;
  return { line, col };
}

function finding(node, line0, cat, sev, msg) {
  const p = locOf(node, line0);
  return { line: p.line, col: p.col, cat, sev, msg };
}

function isFetchCallee(callee) {
  if (!callee) return false;
  if (callee.type === 'Identifier' && callee.name === 'fetch') return true;
  if (callee.type === 'MemberExpression' && !callee.computed && callee.property && callee.property.type === 'Identifier' && callee.property.name === 'fetch') {
    const obj = callee.object;
    return obj && obj.type === 'Identifier' && (obj.name === 'window' || obj.name === 'self');
  }
  return false;
}

function stringOf(arg) {
  if (!arg) return null;
  if (arg.type === 'Literal' && typeof arg.value === 'string') return arg.value;
  if (arg.type === 'TemplateLiteral' && arg.expressions.length === 0) return arg.quasis[0].value.cooked || '';
  return null;
}

function walk(ast, line0, findings) {
  const stack = [{ node: ast, fnDepth: 0 }];
  while (stack.length) {
    const { node: n, fnDepth } = stack.pop();
    if (!n || typeof n.type !== 'string') continue;
    switch (n.type) {
      case 'ChainExpression':
        findings.push(finding(n, line0, 'syntax', 'BLOCKER', 'optional chaining ?.'));
        break;
      case 'LogicalExpression':
        if (n.operator === '??') findings.push(finding(n, line0, 'syntax', 'BLOCKER', 'nullish coalescing ??'));
        break;
      case 'AssignmentExpression':
        if (n.operator === '??=' || n.operator === '||=' || n.operator === '&&=') findings.push(finding(n, line0, 'syntax', 'BLOCKER', 'logical assignment ' + n.operator));
        break;
      case 'PropertyDefinition':
        findings.push(finding(n, line0, 'syntax', 'BLOCKER', 'class field'));
        break;
      case 'PrivateIdentifier':
        findings.push(finding(n, line0, 'syntax', 'BLOCKER', 'private #field/#method'));
        break;
      case 'StaticBlock':
        findings.push(finding(n, line0, 'syntax', 'BLOCKER', 'class static block'));
        break;
      case 'AwaitExpression':
        if (fnDepth === 0) findings.push(finding(n, line0, 'syntax', 'BLOCKER', 'top-level await'));
        break;
      case 'ForOfStatement':
        if (n.await) findings.push(finding(n, line0, 'syntax', 'BLOCKER', 'for await (async iteration)'));
        break;
      case 'CatchClause':
        if (!n.param) findings.push(finding(n, line0, 'syntax', 'BLOCKER', 'optional catch binding catch {}'));
        break;
      case 'ObjectExpression':
        for (const p of n.properties) if (p && p.type === 'SpreadElement') findings.push(finding(p, line0, 'syntax', 'BLOCKER', 'object spread {...x}'));
        break;
      case 'ObjectPattern':
        for (const p of n.properties) if (p && p.type === 'RestElement') findings.push(finding(p, line0, 'syntax', 'BLOCKER', 'object rest {...x}'));
        break;
      case 'ImportExpression':
        findings.push(finding(n, line0, 'syntax', 'BLOCKER', 'dynamic import()'));
        break;
      case 'MetaProperty':
        if (n.meta && n.meta.name === 'import' && n.property && n.property.name === 'meta') findings.push(finding(n, line0, 'syntax', 'BLOCKER', 'import.meta'));
        break;
      case 'Literal':
        if (typeof n.bigint === 'string') findings.push(finding(n, line0, 'syntax', 'BLOCKER', 'BigInt literal'));
        if (typeof n.value === 'number' && typeof n.raw === 'string' && n.raw.indexOf('_') !== -1) findings.push(finding(n, line0, 'syntax', 'BLOCKER', 'numeric separator'));
        if (n.regex) {
          const pattern = n.regex.pattern || '';
          const flags = n.regex.flags || '';
          if (/\(\?<[=!]/.test(pattern)) findings.push(finding(n, line0, 'syntax', 'BLOCKER', 'regex lookbehind'));
          if (/\(\?<[A-Za-z_$]/.test(pattern) || /\\k</.test(pattern)) findings.push(finding(n, line0, 'syntax', 'BLOCKER', 'regex named group'));
          if (flags.indexOf('s') !== -1) findings.push(finding(n, line0, 'syntax', 'BLOCKER', 'regex dotAll /s flag'));
          if (flags.indexOf('d') !== -1) findings.push(finding(n, line0, 'syntax', 'BLOCKER', 'regex /d flag'));
          if (/\\p\{/.test(pattern)) findings.push(finding(n, line0, 'syntax', 'BLOCKER', 'regex unicode property \\p{}'));
        }
        break;
      case 'Identifier':
        if (n.name === 'globalThis') findings.push(finding(n, line0, 'api', 'WARN', 'globalThis'));
        break;
      case 'MemberExpression':
        if (!n.computed && n.property && n.property.type === 'Identifier' && n.object && n.object.type === 'Identifier') {
          if (n.object.name === 'Object' && n.property.name === 'fromEntries') findings.push(finding(n, line0, 'api', 'WARN', 'Object.fromEntries'));
          if (n.object.name === 'Object' && n.property.name === 'hasOwn') findings.push(finding(n, line0, 'api', 'WARN', 'Object.hasOwn'));
          if (n.object.name === 'Promise' && (n.property.name === 'allSettled' || n.property.name === 'any')) findings.push(finding(n, line0, 'api', 'WARN', 'Promise.' + n.property.name));
        }
        break;
      case 'CallExpression': {
        const callee = n.callee;
        if (callee && callee.type === 'MemberExpression' && !callee.computed && callee.property && callee.property.type === 'Identifier') {
          const name = callee.property.name;
          if (name === 'flat' || name === 'flatMap') findings.push(finding(n, line0, 'api', 'WARN', 'Array.prototype.' + name));
          if (name === 'matchAll' || name === 'replaceAll') findings.push(finding(n, line0, 'api', 'WARN', name));
          if (name === 'structuredClone' || (callee.object && callee.object.type === 'Identifier' && callee.object.name === 'structuredClone')) {
            /* structuredClone() is an Identifier callee, handled below */
          }
        }
        if (callee && callee.type === 'Identifier' && callee.name === 'structuredClone') findings.push(finding(n, line0, 'api', 'WARN', 'structuredClone'));
        if (isFetchCallee(callee)) {
          const url = stringOf(n.arguments[0]);
          if (url == null) findings.push(finding(n, line0, 'fetch', 'WARN', 'fetch(<non-literal>)'));
          else if (/^(https?:)?\/\//.test(url)) findings.push(finding(n, line0, 'fetch', 'WARN', 'fetch(' + JSON.stringify(url.slice(0, 80)) + ') remote'));
          else findings.push(finding(n, line0, 'fetch', 'BLOCKER', 'fetch(' + JSON.stringify(url.slice(0, 80)) + ') local package URL — use XHR'));
        }
        break;
      }
      default:
        break;
    }
    let childDepth = fnDepth;
    if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') childDepth = fnDepth + 1;
    const keys = Object.keys(n);
    for (let i = keys.length - 1; i >= 0; i--) {
      const k = keys[i];
      if (k === 'loc' || k === 'range') continue;
      const v = n[k];
      if (Array.isArray(v)) {
        for (let j = v.length - 1; j >= 0; j--) if (v[j] && typeof v[j].type === 'string') stack.push({ node: v[j], fnDepth: childDepth });
      } else if (v && typeof v.type === 'string') stack.push({ node: v, fnDepth: childDepth });
    }
  }
}

function parseError(err, line0) {
  const line = (err.loc && err.loc.line ? err.loc.line : 1) + (line0 || 0);
  const col = err.loc && err.loc.column != null ? err.loc.column + 1 : 1;
  const msg = String(err.message || err).replace(/\s*\(\d+:\d+\)\s*$/, '');
  return { line, col, msg };
}

function scanOne(job) {
  const code = job.code || '';
  const line0 = job.line0 || 0;
  const sourceType = job.module ? 'module' : 'script';
  const base = { ecmaVersion: 'latest', locations: true, allowHashBang: true, allowAwaitOutsideFunction: true, sourceType };
  const out = { findings: [] };
  let ast;
  try {
    ast = acorn.parse(code, base);
  } catch (e) {
    out.parseError = parseError(e, line0);
    return out;
  }
  try {
    acorn.parse(code, { ecmaVersion: 2017, locations: true, allowHashBang: true, sourceType });
  } catch (e) {
    out.parse2017 = parseError(e, line0);
  }
  walk(ast, line0, out.findings);
  return out;
}

(async () => {
  const raw = await readStdin();
  const jobs = raw.trim() ? JSON.parse(raw) : [];
  const results = {};
  for (const job of jobs) results[job.id] = scanOne(job);
  process.stdout.write(JSON.stringify({ parser: 'acorn ' + (acorn.version || ''), results }));
})().catch((e) => {
  process.stderr.write(String(e && e.stack || e) + '\n');
  process.exit(1);
});
