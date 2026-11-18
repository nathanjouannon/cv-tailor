// État global, bus d'événements et petits utilitaires DOM.
export const state = {
  config: {},
  sante: null,
  templates: [],
  modeles: [],
  candidatures: [],
  offre: '',
  analyse: null,        // analyse affichée (standalone ou celle de la candidature ouverte)
  analyseInfo: null,    // { dureeMs, modele }
  doc: null,            // { kind: 'modele' | 'candidature', id, cv, meta?, analyse?, offre? }
  template: null,       // { meta, html, css } du template courant
  match: null,          // résultat de computeMatch
  dirty: false,
  view: 'cv',           // vue du panneau droit : 'cv' | 'lettre' (lettre : candidatures uniquement)
};

const target = new EventTarget();
export const bus = {
  on: (name, fn) => target.addEventListener(name, (e) => fn(e.detail)),
  emit: (name, detail) => target.dispatchEvent(new CustomEvent(name, { detail })),
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') node.innerHTML = v;
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function debounce(fn, ms) {
  let t;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.cancel = () => clearTimeout(t);
  d.flush = (...args) => { clearTimeout(t); fn(...args); };
  return d;
}

export function toast(message, { type = '', duration = 4000, action } = {}) {
  const box = $('#toasts');
  const node = el('div', { class: `toast ${type}` }, el('span', {}, message));
  if (action) node.append(el('button', { class: 'btn small', onClick: () => { action.onClick(); node.remove(); } }, action.label));
  box.append(node);
  if (duration) setTimeout(() => node.remove(), duration);
  return node;
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function download(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast(`« ${text} » copié`, { duration: 1500 }); } catch { toast('Copie impossible', { type: 'error' }); }
}

export const STATUTS = ['brouillon', 'envoyée', 'entretien', 'refus', 'acceptée'];
export const CATEGORIES = {
  competence_technique: 'technique', outil: 'outil', soft_skill: 'soft skill', methodologie: 'méthode',
  certification: 'certif.', domaine: 'domaine', langue: 'langue', diplome: 'diplôme', autre: 'autre',
};
