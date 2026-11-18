// Éditeur par sections : construit le formulaire à partir du CV et le maintient synchronisé.
import { state, el, $ } from './state.js';
import { DEFAULT_SECTIONS, DEFAULT_TITLES } from './render.js';
import { bindSpotlight, collapseBar } from './editor-ui.js';

const SECTION_DEFS = {
  experiences: {
    fields: [
      ['poste', 'Poste', 'text'], ['entreprise', 'Entreprise', 'text'], ['lieu', 'Lieu', 'text'],
      ['debut', 'Début', 'text'], ['fin', 'Fin', 'text'], ['description', 'Contexte (optionnel)', 'textarea'],
      ['points', 'Réalisations (une par ligne)', 'lines'],
    ],
    label: (it) => it.poste || it.entreprise || 'Expérience',
    blank: () => ({ poste: '', entreprise: '', lieu: '', debut: '', fin: '', description: '', points: [] }),
  },
  formations: {
    fields: [
      ['diplome', 'Diplôme', 'text'], ['etablissement', 'Établissement', 'text'], ['lieu', 'Lieu', 'text'],
      ['debut', 'Début', 'text'], ['fin', 'Fin', 'text'], ['details', 'Détails (optionnel)', 'textarea'],
    ],
    label: (it) => it.diplome || 'Formation',
    blank: () => ({ diplome: '', etablissement: '', lieu: '', debut: '', fin: '', details: '' }),
  },
  competences: {
    fields: [['categorie', 'Catégorie', 'text'], ['items', 'Compétences (séparées par des virgules)', 'csv']],
    label: (it) => it.categorie || 'Catégorie',
    blank: () => ({ categorie: '', items: [] }),
    note: "Section la plus lue par les ATS : reprends l'orthographe exacte des mots-clés de l'offre.",
  },
  projets: {
    fields: [['nom', 'Nom', 'text'], ['lien', 'Lien', 'text'], ['description', 'Description', 'textarea'], ['points', 'Points (un par ligne)', 'lines']],
    label: (it) => it.nom || 'Projet',
    blank: () => ({ nom: '', lien: '', description: '', points: [] }),
  },
  langues: {
    fields: [['langue', 'Langue', 'text'], ['niveau', 'Niveau', 'text']],
    label: (it) => it.langue || 'Langue',
    blank: () => ({ langue: '', niveau: '' }),
  },
  certifications: {
    fields: [['nom', 'Nom', 'text'], ['organisme', 'Organisme', 'text'], ['date', 'Date', 'text']],
    label: (it) => it.nom || 'Certification',
    blank: () => ({ nom: '', organisme: '', date: '' }),
  },
  interets: { simple: 'lines', label: () => '' },
};

const openSections = new Set(['identite', 'experiences']);
let onChange = () => {};

export function buildEditor(cv, changeHandler) {
  onChange = changeHandler;
  const root = $('#editor');
  const scrollTop = root.scrollTop;
  root.innerHTML = '';
  root.append(identitySection(cv), resumeSection(cv));
  const order = Array.isArray(cv.sections) && cv.sections.length ? cv.sections : [...DEFAULT_SECTIONS];
  if (!Array.isArray(cv.sections)) cv.sections = [...order];
  const all = [...order, ...DEFAULT_SECTIONS.filter((s) => !order.includes(s))];
  all.forEach((id) => root.append(listSection(cv, id)));
  root.prepend(collapseBar(root, openSections).bar);
  root.scrollTop = scrollTop;
}

// ---------- Helpers de liaison ----------
function bindInput(input, get, set) {
  input.value = get() ?? '';
  input.addEventListener('input', () => { set(input.value); onChange('value'); });
  return input;
}
function field(label, input, extra = {}) {
  return el('label', { class: `field ${extra.class || ''}` }, el('span', {}, label), input);
}
function textInput(obj, key, placeholder = '') {
  return bindInput(el('input', { type: 'text', placeholder }), () => obj[key], (v) => { obj[key] = v; });
}
function textArea(obj, key, cls = '') {
  return bindInput(el('textarea', { class: cls }), () => obj[key], (v) => { obj[key] = v; });
}
function linesArea(obj, key) {
  return bindInput(el('textarea', { class: 'points', placeholder: 'Une entrée par ligne' }),
    () => (obj[key] || []).join('\n'), (v) => { obj[key] = v.split('\n').map((s) => s.trim()).filter(Boolean); });
}
function csvInput(obj, key) {
  return bindInput(el('input', { type: 'text', placeholder: 'ex. JavaScript, Node.js, Docker' }),
    () => (obj[key] || []).join(', '), (v) => { obj[key] = v.split(',').map((s) => s.trim()).filter(Boolean); });
}

function sectionShell(id, titleNode, body, { count, tools = [], hidden = false } = {}) {
  const sec = el('div', { class: `ed-section ${openSections.has(id) ? 'open' : ''} ${hidden ? 'hidden-section' : ''}`, dataset: { section: id } });
  const head = el('div', { class: 'ed-head' },
    el('span', { class: 'caret' }, '▶'), titleNode,
    count != null ? el('span', { class: 'count' }, count) : null,
    el('span', { class: 'ed-tools' }, ...tools));
  head.addEventListener('click', (e) => {
    if (e.target.closest('input, button, select')) return;
    sec.classList.toggle('open');
    if (sec.classList.contains('open')) openSections.add(id); else openSections.delete(id);
  });
  bindSpotlight(head, id);
  sec.append(head, el('div', { class: 'ed-body' }, body));
  return sec;
}

const fixedTitle = (txt) => el('span', { class: 'ed-title-wrap' }, el('span', { class: 'ed-title' }, txt));

// ---------- Identité ----------
function identitySection(cv) {
  const id = cv.identite;
  const liens = el('div', {});
  const renderLiens = () => {
    liens.innerHTML = '';
    id.liens.forEach((l, i) => {
      liens.append(el('div', { class: 'ed-item' },
        itemTools(id.liens, i, renderLiens),
        el('div', { class: 'grid2' }, field('Libellé', textInput(l, 'label', 'linkedin.com/in/…')), field('URL', textInput(l, 'url', 'https://…')))));
    });
    liens.append(el('button', { class: 'btn small ed-add', type: 'button', onClick: () => { id.liens.push({ label: '', url: '' }); renderLiens(); onChange('structure'); } }, '+ Ajouter un lien'));
  };
  renderLiens();
  const body = el('div', {},
    el('div', { class: 'grid2' }, field('Prénom', textInput(id, 'prenom')), field('Nom', textInput(id, 'nom'))),
    field('Titre / intitulé du poste visé', textInput(id, 'titre', 'ex. Développeur full-stack')),
    el('div', { class: 'grid2' }, field('Email', textInput(id, 'email')), field('Téléphone', textInput(id, 'telephone'))),
    field('Adresse / ville', textInput(id, 'adresse')),
    el('p', { class: 'ed-note' }, 'Liens (LinkedIn, GitHub, portfolio)'), liens);
  return sectionShell('identite', fixedTitle('Identité'), body);
}

// ---------- Profil ----------
function resumeSection(cv) {
  const title = titleInput(cv, 'resume');
  const body = el('div', {}, field("Accroche (2 à 4 phrases). Reprends le titre du poste et 3 à 5 mots-clés majeurs de l'offre.", textArea(cv, 'resume', 'resume')));
  return sectionShell('resume', title, body);
}

/** Titre de section : texte cliquable (replie/déplie) + crayon pour renommer. Vide = titre par défaut. */
function titleInput(cv, id) {
  const lang = cv.langue === 'en' ? 'en' : 'fr';
  cv.titres = cv.titres || {};
  const defaut = DEFAULT_TITLES[lang][id] || id;
  const wrap = el('span', { class: 'ed-title-wrap' });
  const label = el('span', { class: 'ed-title' }, cv.titres[id] || defaut);
  const pencil = el('button', { class: 'btn icon ghost pencil', type: 'button', title: 'Renommer la section dans le CV' }, '✎');
  pencil.addEventListener('click', (e) => {
    e.stopPropagation();
    const input = el('input', { class: 'ed-title-input', type: 'text', placeholder: defaut });
    input.value = cv.titres[id] || '';
    const done = () => {
      const v = input.value.trim();
      if (v && v !== defaut) cv.titres[id] = v; else delete cv.titres[id];
      label.textContent = cv.titres[id] || defaut;
      input.replaceWith(label);
      onChange('value');
    };
    input.addEventListener('blur', done);
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); input.blur(); } });
    input.addEventListener('click', (ev) => ev.stopPropagation());
    label.replaceWith(input);
    input.focus(); input.select();
  });
  wrap.append(label, pencil);
  return wrap;
}

// ---------- Sections listes ----------
function listSection(cv, id) {
  const def = SECTION_DEFS[id];
  if (!def) return el('div');
  if (!Array.isArray(cv[id])) cv[id] = [];
  const list = cv[id];
  const visible = cv.sections.includes(id);
  const idx = cv.sections.indexOf(id);

  const tools = [
    el('button', { class: 'btn icon ghost', type: 'button', title: 'Monter', disabled: !visible || idx <= 0, onClick: () => { move(cv.sections, idx, idx - 1); rebuild(); } }, '↑'),
    el('button', { class: 'btn icon ghost', type: 'button', title: 'Descendre', disabled: !visible || idx >= cv.sections.length - 1, onClick: () => { move(cv.sections, idx, idx + 1); rebuild(); } }, '↓'),
    el('button', { class: 'btn icon ghost', type: 'button', title: visible ? 'Masquer la section' : 'Afficher la section', onClick: () => {
      if (visible) cv.sections.splice(idx, 1); else cv.sections.push(id);
      rebuild();
    } }, visible ? '👁' : '🚫'),
  ];

  let body;
  if (def.simple === 'lines') {
    body = el('div', {}, field('Une entrée par ligne', linesArea(cv, id)));
  } else {
    body = el('div', {});
    const renderItems = () => {
      body.innerHTML = '';
      if (def.note) body.append(el('p', { class: 'ed-note' }, def.note));
      list.forEach((item, i) => body.append(itemCard(def, list, item, i, renderItems)));
      body.append(el('button', { class: 'btn small ed-add', type: 'button', onClick: () => { list.push(def.blank()); renderItems(); onChange('structure'); } }, '+ Ajouter'));
    };
    renderItems();
  }
  const count = def.simple ? (list.length || '') : (list.length || '');
  return sectionShell(id, titleInput(cv, id), body, { count, tools, hidden: !visible });
}

function itemCard(def, list, item, i, rerender) {
  const card = el('div', { class: 'ed-item' });
  card.append(itemTools(list, i, rerender, def.label(item)));
  const grid = el('div', { class: 'grid2' });
  for (const [key, label, type] of def.fields) {
    let input;
    if (type === 'textarea') input = textArea(item, key);
    else if (type === 'lines') input = linesArea(item, key);
    else if (type === 'csv') input = csvInput(item, key);
    else input = textInput(item, key);
    const f = field(label, input);
    if (type === 'text' && !['description', 'details'].includes(key)) grid.append(f);
    else { if (grid.children.length) { card.append(grid.cloneNode(false)); card.lastChild.append(...grid.children); } card.append(f); }
  }
  if (grid.children.length) card.append(grid);
  return card;
}

function itemTools(list, i, rerender, label = '') {
  const act = (fn) => () => { fn(); rerender(); onChange('structure'); };
  return el('div', { class: 'ed-item-head' },
    el('span', { class: 'idx' }, label ? `${i + 1}. ${label}` : `#${i + 1}`),
    el('button', { class: 'btn icon ghost', type: 'button', title: 'Monter', disabled: i === 0, onClick: act(() => move(list, i, i - 1)) }, '↑'),
    el('button', { class: 'btn icon ghost', type: 'button', title: 'Descendre', disabled: i === list.length - 1, onClick: act(() => move(list, i, i + 1)) }, '↓'),
    el('button', { class: 'btn icon ghost', type: 'button', title: 'Dupliquer', onClick: act(() => list.splice(i + 1, 0, JSON.parse(JSON.stringify(list[i])))) }, '⧉'),
    el('button', { class: 'btn icon ghost danger', type: 'button', title: 'Supprimer', onClick: act(() => list.splice(i, 1)) }, '✕'));
}

function move(arr, from, to) {
  if (to < 0 || to >= arr.length) return;
  const [x] = arr.splice(from, 1); arr.splice(to, 0, x);
}
function rebuild() { buildEditor(state.doc.cv, onChange); onChange('structure'); }
