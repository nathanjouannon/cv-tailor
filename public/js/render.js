// Mini moteur de templates partagé client/serveur (modules ES, aucune dépendance).
// Syntaxe : {{chemin}}  {{{brut}}}  {{#each liste}}…{{/each}}  {{#if x}}…{{/if}}  {{#unless x}}…{{/unless}}
//           {{#sections}}…{{/sections}}  {{#is "id"}}…{{/is}}  {{titre "id"}} / {{titre}}  {{../parent}}  {{this}}  {{@index}}
// Voir docs/05-templates.md.

export const DEFAULT_SECTIONS = [
  'experiences', 'competences', 'formations', 'projets', 'certifications', 'interets',
];

export const DEFAULT_TITLES = {
  fr: {
    resume: 'Profil',
    experiences: 'Expériences professionnelles',
    competences: 'Compétences',
    formations: 'Formation',
    projets: 'Projets',
    langues: 'Langues',
    certifications: 'Certifications',
    interets: "Centres d'intérêt",
  },
  en: {
    resume: 'Profile',
    experiences: 'Experience',
    competences: 'Skills',
    formations: 'Education',
    projets: 'Projects',
    langues: 'Languages',
    certifications: 'Certifications',
    interets: 'Interests',
  },
};

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/** Une section est « active » si elle figure dans cv.sections et qu'elle a du contenu. */
export function activeSections(cv) {
  const order = Array.isArray(cv.sections) && cv.sections.length ? cv.sections : DEFAULT_SECTIONS;
  return order.filter((id) => hasContent(cv[id]));
}

export function sectionTitle(cv, id) {
  const custom = cv.titres && cv.titres[id];
  if (custom) return custom;
  const lang = cv.langue === 'en' ? 'en' : 'fr';
  return DEFAULT_TITLES[lang][id] || id;
}

function hasContent(v) {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return Boolean(v);
}

// ---------- Analyse syntaxique ----------
const TAG_RE = /\{\{\{\s*([^}]+?)\s*\}\}\}|\{\{\s*([^}]+?)\s*\}\}/g;
const cache = new Map();

function parse(src) {
  if (cache.has(src)) return cache.get(src);
  const root = { type: 'root', children: [] };
  const stack = [root];
  let last = 0;
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(src))) {
    if (m.index > last) stack[stack.length - 1].children.push({ type: 'text', value: src.slice(last, m.index) });
    last = m.index + m[0].length;
    if (m[1] != null) {
      stack[stack.length - 1].children.push({ type: 'var', path: m[1].trim(), raw: true });
      continue;
    }
    const tag = m[2].trim();
    if (tag.startsWith('#')) {
      const [kind, ...rest] = tag.slice(1).split(/\s+/);
      const node = { type: 'block', kind, arg: unquote(rest.join(' ')), children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else if (tag.startsWith('/')) {
      const kind = tag.slice(1).trim();
      const open = stack.pop();
      if (!open || open.kind !== kind) throw new Error(`Template : fermeture {{/${kind}}} inattendue`);
    } else if (tag.startsWith('!')) {
      // commentaire
    } else if (/^titre(\s|$)/.test(tag)) {
      stack[stack.length - 1].children.push({ type: 'titre', arg: unquote(tag.slice(5).trim()) });
    } else {
      stack[stack.length - 1].children.push({ type: 'var', path: tag, raw: false });
    }
  }
  if (last < src.length) root.children.push({ type: 'text', value: src.slice(last) });
  if (stack.length !== 1) throw new Error(`Template : bloc {{#${stack[stack.length - 1].kind}}} non fermé`);
  cache.set(src, root);
  return root;
}

const unquote = (s) => (s && /^(["']).*\1$/.test(s) ? s.slice(1, -1) : s);

// ---------- Résolution ----------
function lookup(scopes, path) {
  if (path === 'this' || path === '.') return scopes[scopes.length - 1].value;
  let depth = scopes.length - 1;
  let p = path;
  while (p.startsWith('../')) { depth -= 1; p = p.slice(3); }
  if (depth < 0) return undefined;
  if (p.startsWith('@')) {
    const meta = scopes[depth].meta || {};
    return meta[p.slice(1)];
  }
  const parts = p.split('.');
  // Cherche la première clé dans la portée courante puis les parents.
  for (let d = depth; d >= 0; d -= 1) {
    const base = scopes[d].value;
    if (base != null && typeof base === 'object' && parts[0] in base) {
      return parts.reduce((acc, k) => (acc == null ? undefined : acc[k]), base);
    }
  }
  return undefined;
}

function evalNodes(nodes, scopes, cv) {
  let out = '';
  for (const n of nodes) {
    switch (n.type) {
      case 'text': out += n.value; break;
      case 'var': {
        const v = lookup(scopes, n.path);
        if (v == null) break;
        out += n.raw ? String(v) : escapeHtml(v);
        break;
      }
      case 'titre': {
        const cur = scopes[scopes.length - 1].value;
        const id = n.arg || (typeof cur === 'string' ? cur : '');
        out += escapeHtml(sectionTitle(cv, id));
        break;
      }
      case 'block': out += evalBlock(n, scopes, cv); break;
      default: break;
    }
  }
  return out;
}

function evalBlock(n, scopes, cv) {
  switch (n.kind) {
    case 'each': {
      const list = lookup(scopes, n.arg);
      if (!Array.isArray(list) || !list.length) return '';
      return list.map((item, i) => evalNodes(n.children,
        [...scopes, { value: item, meta: { index: i, first: i === 0, last: i === list.length - 1 } }], cv)).join('');
    }
    case 'if': return hasContent(lookup(scopes, n.arg)) ? evalNodes(n.children, scopes, cv) : '';
    case 'unless': return hasContent(lookup(scopes, n.arg)) ? '' : evalNodes(n.children, scopes, cv);
    case 'sections': {
      const ids = activeSections(cv);
      return ids.map((id, i) => evalNodes(n.children,
        [...scopes, { value: id, meta: { index: i, first: i === 0, last: i === ids.length - 1 } }], cv)).join('');
    }
    case 'is': {
      const cur = scopes[scopes.length - 1].value;
      return cur === n.arg ? evalNodes(n.children, scopes, cv) : '';
    }
    case 'section': {
      return activeSections(cv).includes(n.arg) ? evalNodes(n.children, scopes, cv) : '';
    }
    default: throw new Error(`Template : bloc inconnu {{#${n.kind}}}`);
  }
}

/** Rend le fragment HTML d'un template pour un CV. */
export function render(templateHtml, cv) {
  const ast = parse(templateHtml);
  return evalNodes(ast.children, [{ value: cv, meta: {} }], cv);
}

/** Document HTML complet (utilisé pour le PDF). */
export function fullDocument({ html, css, lang = 'fr', accent, title = 'CV' }) {
  const vars = accent ? `:root{--accent:${escapeHtml(accent)};}` : '';
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>html,body{margin:0;padding:0}${vars}${css}</style>
</head>
<body class="pdf">${html}</body>
</html>`;
}
