// Point d'entrée : chargement initial, barre d'outils, panneau redimensionnable, réglages, raccourcis.
import { state, bus, $, $$, el, toast } from './state.js';
import { api } from './api.js';
import { initAnalysis } from './analysis.js';
import { initLibrary, refreshLists, refreshTemplates } from './library.js';
import { initImport } from './import.js';
import { closeDoc, save, exportPdf, exportJson, onEdit, activateTab, setView } from './doc.js';
import { renderPreview, scalePreview } from './preview.js';
import { buildEditor } from './editor.js';
import { initSpellcheck } from './spellcheck.js';

async function init() {
  // Onglets
  $$('.tab').forEach((t) => t.addEventListener('click', () => activateTab(t.dataset.tab)));

  // Données initiales
  try {
    [state.config, state.sante, state.templates] = await Promise.all([api.getConfig(), api.sante(), api.templates()]);
  } catch (e) { toast(`Serveur injoignable : ${e.message}`, { type: 'error', duration: 0 }); return; }
  renderStatus();
  const sel = $('#sel-template');
  await refreshTemplates();

  initAnalysis();
  initLibrary();
  initImport();
  initSpellcheck();
  await refreshLists();

  // Barre d'outils du document
  $('#doc-nom').addEventListener('input', (e) => { if (state.doc) { state.doc.cv.nom = e.target.value; onEdit(); } });
  sel.addEventListener('change', () => { if (state.doc) { state.doc.cv.template = sel.value; onEdit(); } });
  $('#sel-langue').addEventListener('change', (e) => {
    if (!state.doc) return;
    state.doc.cv.langue = e.target.value;
    buildEditor(state.doc.cv, onEdit); // les titres par défaut changent
    onEdit();
  });
  $$('#doc-view button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#btn-fermer').addEventListener('click', closeDoc);
  $('#btn-export-pdf').addEventListener('click', () => exportPdf());
  $('#btn-export-json').addEventListener('click', exportJson);
  $('#chip-save').addEventListener('click', () => save());

  // Panneau gauche : repli + redimensionnement
  const layout = $('#layout');
  const toggleLeft = () => {
    if (layout.dataset.mode !== 'split') return;
    layout.dataset.left = layout.dataset.left === 'collapsed' ? '' : 'collapsed';
    requestAnimationFrame(scalePreview);
  };
  $('#btn-toggle-left').addEventListener('click', toggleLeft);
  initSplitter(layout);
  bus.on('doc', () => { $('#btn-toggle-left').hidden = !state.doc; });
  $('#btn-toggle-left').hidden = true;

  // Réglages
  initSettings();

  // Raccourcis
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    else if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); exportPdf(); }
    else if (mod && e.key === '\\') { e.preventDefault(); toggleLeft(); }
    else if (e.key === 'Escape' && state.doc && !document.querySelector('dialog[open]')) { closeDoc(); }
  });
  window.addEventListener('beforeunload', (e) => { if (state.dirty) { save(); e.preventDefault(); e.returnValue = ''; } });
}

function renderStatus() {
  const s = state.sante;
  const bar = $('#status-bar');
  bar.innerHTML = '';
  const item = (ok, label, title) => el('span', { title }, el('i', { class: `dot ${ok ? 'ok' : 'ko'}` }), label);
  bar.append(
    item(s.claude.trouve, 'Claude Code', s.claude.chemin || 'commande claude introuvable'),
    item(s.chromium.present, 'Chromium (PDF)', s.chromium.chemin || 'Chromium absent : relance npm install'),
  );
}

function initSplitter(layout) {
  const splitter = $('#splitter');
  const saved = localStorage.getItem('cvtailor.leftw');
  if (saved) layout.style.setProperty('--left-w', `${saved}px`);
  let dragging = false;
  splitter.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); document.body.style.cursor = 'col-resize'; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const w = Math.min(Math.max(e.clientX, 260), window.innerWidth * 0.6);
    layout.style.setProperty('--left-w', `${w}px`);
    layout.dataset.left = '';
    scalePreview();
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false; document.body.style.cursor = '';
    localStorage.setItem('cvtailor.leftw', parseInt(layout.style.getPropertyValue('--left-w'), 10) || 400);
  });
}

function initSettings() {
  const dlg = $('#dlg-settings');
  const form = $('#form-settings');
  $('#btn-settings').addEventListener('click', async () => {
    try { state.config = await api.getConfig(); state.sante = await api.sante(); } catch { /* garde l'état connu */ }
    form.claudeModel.value = state.config.claudeModel || '';
    form.claudeEffort.value = state.config.claudeEffort || '';
    form.claudePath.value = state.config.claudePath || '';
    form.verifierAvantExport.checked = Boolean(state.config.verifierAvantExport);
    form.analyseTimeoutS.value = Math.round((state.config.analyseTimeoutMs || 180000) / 1000);
    const s = state.sante;
    $('#settings-sante').innerHTML = `
      <div>Node ${s.node}</div>
      <div>Claude Code : ${s.claude.trouve ? '✅' : '❌'} <code>${s.claude.chemin || 'introuvable'}</code></div>
      <div>Chromium : ${s.chromium.present ? '✅' : '❌'} <code>${s.chromium.chemin || ''}</code></div>
      <div>Données : <code>${s.data}</code></div>`;
    dlg.showModal();
  });
  dlg.addEventListener('close', async () => {
    if (dlg.returnValue !== 'ok') return;
    try {
      state.config = await api.saveConfig({
        claudeModel: form.claudeModel.value.trim(),
        claudeEffort: form.claudeEffort.value,
        claudePath: form.claudePath.value.trim(),
        verifierAvantExport: form.verifierAvantExport.checked,
        analyseTimeoutMs: Math.max(30, Number(form.analyseTimeoutS.value) || 180) * 1000,
      });
      state.sante = await api.sante();
      renderStatus();
      toast('Réglages enregistrés', { type: 'success' });
    } catch (e) { toast(e.message, { type: 'error' }); }
  });
}

init().catch((e) => { console.error(e); toast(`Erreur au démarrage : ${e.message}`, { type: 'error', duration: 0 }); });
// Re-rendu si l'onglet redevient visible (polices chargées, etc.)
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.doc) renderPreview(); });
