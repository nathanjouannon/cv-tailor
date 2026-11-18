// Correcteur d'orthographe : dialogue de revue des fautes, application des corrections, hook avant export.
import { state, $, el, toast } from './state.js';
import { api } from './api.js';
import { onEdit, rebuildEditor, exportPdf } from './doc.js';
import { renderPreview } from './preview.js';

const CAT_LABELS = {
  orthographe: 'Orthographe', grammaire: 'Grammaire', accord: 'Accord', conjugaison: 'Conjugaison',
  ponctuation: 'Ponctuation', typographie: 'Typographie',
};

let session = null; // { problemes, mode, resolve }

export function initSpellcheck() {
  $('#btn-spell').addEventListener('click', () => runSpellcheck());
  const dlg = $('#dlg-spell');
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });
  $('#spell-fermer').addEventListener('click', () => finish(false));
  $('#spell-tout').addEventListener('click', applyAll);
  $('#spell-exporter').addEventListener('click', () => finish(true));
  $('#spell-relancer').addEventListener('click', () => start(session ? session.mode : 'manuel', session ? session.resolve : null));
}

/** Vérification lancée à la main depuis la barre d'outils. */
export function runSpellcheck() {
  if (!state.doc) return Promise.resolve(false);
  return start('manuel', null);
}

/**
 * Appelé par l'export PDF quand le réglage « vérifier avant export » est actif.
 * @returns {Promise<boolean>} true si l'export doit continuer.
 */
export function checkBeforeExport() {
  return new Promise((resolve) => start('export', resolve));
}

// ---------- Cycle de vie ----------

async function start(mode, resolve) {
  const doc = state.doc;
  if (!doc) { if (resolve) resolve(false); return false; }
  const dlg = $('#dlg-spell');
  session = { problemes: [], mode, resolve, vue: state.view };
  setPhase('chargement');
  if (!dlg.open) dlg.showModal();
  const t0 = Date.now();
  const chrono = setInterval(() => { $('#spell-chrono').textContent = `${Math.round((Date.now() - t0) / 1000)} s`; }, 500);
  const mine = session;
  try {
    const lettre = state.view === 'lettre' && doc.lettre;
    const res = await api.verifierOrthographe(lettre ? { type: 'lettre', lettre: doc.lettre } : { type: 'cv', cv: doc.cv });
    if (session !== mine) return false; // fermé ou relancé entre-temps
    mine.problemes = res.problemes.map((p) => ({ ...p, etat: 'ouvert' }));
    mine.nbChamps = res.nbChamps;
    mine.dureeMs = res.dureeMs;
    if (!mine.problemes.length && mode === 'export') {
      toast('Aucune faute détectée', { type: 'success', duration: 2000 });
      return finish(true);
    }
    renderResults();
  } catch (e) {
    if (session !== mine) return false;
    $('#spell-erreur').textContent = e.message;
    setPhase('erreur');
  } finally {
    clearInterval(chrono);
  }
  return true;
}

function finish(proceed) {
  const s = session;
  session = null;
  const dlg = $('#dlg-spell');
  if (dlg.open) dlg.close();
  if (s && s.resolve) s.resolve(proceed);
  else if (proceed) exportPdf({ skipCheck: true });
  return proceed;
}

// ---------- Rendu ----------

function setPhase(phase) {
  $('#spell-progress').hidden = phase !== 'chargement';
  $('#spell-erreur').hidden = phase !== 'erreur';
  $('#spell-resultats').hidden = phase !== 'resultats';
  $('#spell-chrono').textContent = '0 s';
  const exportMode = session && session.mode === 'export';
  $('#spell-tout').hidden = phase !== 'resultats';
  $('#spell-relancer').hidden = phase === 'chargement';
  $('#spell-exporter').hidden = phase === 'chargement';
  $('#spell-exporter').textContent = exportMode ? 'Exporter le PDF' : '⬇ Exporter le PDF';
  $('#spell-fermer').textContent = exportMode ? 'Annuler l\'export' : 'Fermer';
}

function renderResults() {
  const { problemes, nbChamps } = session;
  const ouverts = problemes.filter((p) => p.etat === 'ouvert');
  const box = $('#spell-resultats');
  box.innerHTML = '';
  setPhase('resultats');
  $('#spell-tout').disabled = !ouverts.length;
  $('#spell-tout').textContent = ouverts.length > 1 ? `Tout corriger (${ouverts.length})` : 'Tout corriger';

  const corriges = problemes.filter((p) => p.etat === 'corrige').length;
  const titre = !problemes.length
    ? `✓ Aucune faute détectée (${nbChamps} champs relus).`
    : ouverts.length
      ? `${ouverts.length} faute${ouverts.length > 1 ? 's' : ''} à vérifier${corriges ? ` · ${corriges} corrigée${corriges > 1 ? 's' : ''}` : ''}`
      : `✓ Tout est traité${corriges ? ` · ${corriges} correction${corriges > 1 ? 's' : ''} appliquée${corriges > 1 ? 's' : ''}` : ''}.`;
  box.append(el('div', { class: `spell-summary ${ouverts.length ? '' : 'ok'}` }, titre));

  for (const p of problemes) box.append(issueCard(p));
}

function highlighted(p) {
  const i = p.texte.indexOf(p.fautif);
  const CTX = 50;
  const before = p.texte.slice(Math.max(0, i - CTX), i);
  const after = p.texte.slice(i + p.fautif.length, i + p.fautif.length + CTX);
  return el('div', { class: 'spell-ctx' },
    i > CTX ? '…' : '', before,
    el('del', {}, p.fautif), el('ins', {}, p.correction || '∅'),
    after, i + p.fautif.length + CTX < p.texte.length ? '…' : '');
}

function issueCard(p) {
  const card = el('div', { class: `spell-item ${p.etat !== 'ouvert' ? 'done' : ''}` },
    el('div', { class: 'spell-head' },
      el('span', { class: 'tag' }, CAT_LABELS[p.categorie] || p.categorie),
      el('span', { class: 'muted' }, p.label),
    ),
    highlighted(p),
    p.explication ? el('div', { class: 'hint' }, p.explication) : null,
  );
  if (p.etat === 'ouvert') {
    card.append(el('div', { class: 'row end' },
      el('button', { type: 'button', class: 'btn small ghost', onClick: () => { p.etat = 'ignore'; renderResults(); } }, 'Ignorer'),
      el('button', { type: 'button', class: 'btn small primary', onClick: () => { const ok = applyOne(p); renderResults(); if (ok) commit(); } }, 'Corriger'),
    ));
  } else {
    card.append(el('div', { class: 'hint' }, p.etat === 'corrige' ? '✓ Corrigé' : p.etat === 'obsolete' ? 'Texte modifié depuis : correction ignorée' : 'Ignoré'));
  }
  return card;
}

// ---------- Application des corrections ----------

function root() {
  const doc = state.doc;
  if (!doc) return null;
  return session.vue === 'lettre' ? doc.lettre : doc.cv;
}

/** Remplace la première occurrence du fragment fautif dans le champ visé. Renvoie false si le texte a changé. */
function applyOne(p) {
  const base = root();
  if (!base) { p.etat = 'obsolete'; return false; }
  let parent = base;
  for (const k of p.chemin.slice(0, -1)) parent = parent?.[k];
  const last = p.chemin[p.chemin.length - 1];
  const actuel = parent?.[last];
  if (typeof actuel !== 'string' || !actuel.includes(p.fautif)) { p.etat = 'obsolete'; return false; }
  parent[last] = actuel.replace(p.fautif, () => p.correction);
  // Les autres fautes du même champ doivent voir le nouveau texte.
  for (const q of session.problemes) if (q !== p && q.chemin.join('.') === p.chemin.join('.')) q.texte = parent[last];
  p.etat = 'corrige';
  p.texte = parent[last];
  return true;
}

async function applyAll() {
  let n = 0;
  for (const p of session.problemes) if (p.etat === 'ouvert' && applyOne(p)) n += 1;
  renderResults();
  if (n) await commit();
}

/** Après une ou plusieurs corrections : met à jour l'éditeur, l'aperçu et déclenche la sauvegarde. */
async function commit() {
  onEdit();
  rebuildEditor();
  await renderPreview();
}
