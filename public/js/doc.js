// Ouverture / fermeture / sauvegarde / export du document courant (modèle ou candidature).
import { state, bus, $, $$, debounce, toast, download } from './state.js';
import { api } from './api.js';
import { buildEditor } from './editor.js';
import { renderPreview, exportableHtml, scalePreview, updateScoreChip } from './preview.js';
import { buildLetterEditor } from './letter-editor.js';
import { blankLetter } from './letter.js';
import { checkBeforeExport } from './spellcheck.js';

const scheduleRender = debounce(() => renderPreview(), 120);
const scheduleSave = debounce(() => save(), 800);

export function setSaveState(s, msg) {
  const chip = $('#chip-save');
  chip.dataset.state = s;
  chip.textContent = msg || { clean: 'Enregistré', dirty: 'Modifié…', saving: 'Enregistrement…', error: 'Erreur de sauvegarde' }[s];
}

export async function openModele(id) {
  const cv = await api.modele(id);
  await openDoc({ kind: 'modele', id, cv });
}

export async function openCandidature(id) {
  const c = await api.candidature(id);
  state.analyse = c.analyse;
  state.analyseInfo = null;
  state.offre = c.offre || '';
  $('#offre-texte').value = state.offre;
  $('#offre-texte').dispatchEvent(new Event('input'));
  await openDoc({ kind: 'candidature', id, cv: c.cv, meta: c.meta, dossier: c.dossier, analyse: c.analyse, lettre: c.lettre });
  bus.emit('analyse');
  activateTab('analyse');
}

async function openDoc(doc) {
  if (state.doc && state.dirty) await save();
  state.doc = doc;
  state.dirty = false;
  state.view = 'cv';
  const layout = $('#layout');
  layout.dataset.mode = 'split';
  $('#right').hidden = false;
  $('#doc-kind').textContent = doc.kind === 'modele' ? 'Modèle' : 'Candidature';
  $('#doc-nom').value = doc.cv.nom || '';
  $('#sel-template').value = doc.cv.template || 'classique';
  $('#sel-langue').value = doc.cv.langue || 'fr';
  setSaveState('clean');
  syncViewUi();
  rebuildEditor();
  await renderPreview();
  requestAnimationFrame(scalePreview);
  bus.emit('doc');
}

const letterHandlers = () => ({
  onChange: onEdit,
  save,
  onGenerated: () => { rebuildEditor(); renderPreview(); bus.emit('saved', state.doc); },
});

/** Reconstruit le formulaire du panneau droit selon la vue (CV ou lettre). */
export function rebuildEditor() {
  const doc = state.doc;
  if (!doc) return;
  if (state.view === 'lettre' && doc.lettre) buildLetterEditor(doc, letterHandlers());
  else buildEditor(doc.cv, onEdit);
}

function syncViewUi() {
  const doc = state.doc;
  $('#doc-view').hidden = !(doc && doc.kind === 'candidature');
  $$('#doc-view button').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
  $$('.cv-only').forEach((n) => { n.hidden = state.view === 'lettre'; });
  if (state.view === 'lettre') $('#chip-score').hidden = true; else updateScoreChip();
}

/** Bascule entre le CV et la lettre de motivation d'une candidature. */
export async function setView(view) {
  const doc = state.doc;
  if (!doc || doc.kind !== 'candidature') view = 'cv';
  if (view === state.view) return;
  state.view = view;
  if (view === 'lettre' && !doc.lettre) doc.lettre = blankLetter(doc.cv, doc.analyse, doc.analyse?.langue || doc.cv.langue);
  syncViewUi();
  rebuildEditor();
  await renderPreview();
  requestAnimationFrame(scalePreview);
}

export async function closeDoc() {
  if (!state.doc) return;
  if (state.dirty) await save();
  state.doc = null;
  state.view = 'cv';
  state.match = null;
  $('#layout').dataset.mode = 'solo';
  $('#right').hidden = true;
  $('#editor').innerHTML = '';
  $('#preview').innerHTML = '';
  bus.emit('doc');
  bus.emit('match', null);
}

export function onEdit() {
  state.dirty = true;
  setSaveState('dirty');
  scheduleRender();
  scheduleSave();
}

export async function save() {
  const doc = state.doc;
  if (!doc) return;
  scheduleSave.cancel();
  setSaveState('saving');
  try {
    if (doc.kind === 'modele') {
      await api.saveModele(doc.id, doc.cv);
    } else {
      const meta = { score: state.match ? state.match.score : null };
      const saved = await api.updateCandidature(doc.id, { cv: doc.cv, meta, ...(doc.lettre ? { lettre: doc.lettre } : {}) });
      doc.meta = saved.meta;
    }
    state.dirty = false;
    setSaveState('clean');
    bus.emit('saved', doc);
  } catch (e) {
    setSaveState('error');
    toast(`Sauvegarde impossible : ${e.message}`, { type: 'error' });
  }
}

export async function exportPdf({ skipCheck = false } = {}) {
  const doc = state.doc;
  if (!doc) return;
  if (!skipCheck && state.config.verifierAvantExport && !(await checkBeforeExport())) return;
  const btn = $('#btn-export-pdf');
  btn.disabled = true; btn.textContent = 'Génération…';
  try {
    if (state.dirty) await save();
    const payload = await exportableHtml();
    const id = doc.cv.identite || {};
    const suffix = doc.kind === 'candidature' ? (doc.meta.entreprise || doc.meta.poste || '') : (doc.cv.nom || '');
    const lettre = payload.type === 'lettre';
    const nomFichier = [lettre ? (doc.lettre.langue === 'en' ? 'CoverLetter' : 'Lettre') : 'CV', id.prenom, id.nom, suffix].filter(Boolean).join('_');
    const res = await api.exportPdf({ ...payload, nomFichier, candidatureId: doc.kind === 'candidature' ? doc.id : undefined });
    if (doc.kind === 'candidature') doc.meta[lettre ? 'lettrePdf' : 'pdf'] = res.fichier;
    toast(`PDF exporté : ${res.fichier}`, {
      type: 'success', duration: 8000,
      action: { label: 'Ouvrir le dossier', onClick: () => api.ouvrirDossier(res.dossier || res.chemin.replace(/\/[^/]+$/, '')) },
    });
    window.open(`/api/exports/${encodeURIComponent(res.fichier)}`, '_blank');
    bus.emit('saved', doc);
  } catch (e) {
    toast(`Export PDF impossible : ${e.message}`, { type: 'error', duration: 8000 });
  } finally {
    btn.disabled = false; btn.textContent = '⬇ Exporter PDF';
  }
}

export function exportJson() {
  const doc = state.doc;
  if (!doc) return;
  const name = `${(doc.cv.nom || 'cv').replace(/[^\w\-]+/g, '_')}.json`;
  download(name, JSON.stringify({ ...doc.cv, id: doc.kind === 'modele' ? doc.id : undefined }, null, 2));
}

export function activateTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
}
