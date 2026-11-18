// Panneau gauche : saisie de l'offre, lancement de l'analyse, affichage des résultats et du score.
import { state, bus, $, $$, el, toast, copyText, CATEGORIES } from './state.js';
import { api } from './api.js';
import { computeMatch, WEIGHTS } from './match.js';
import { openCandidature, activateTab } from './doc.js';
import { cvToText } from './preview.js';
import { refreshLists } from './library.js';

let filtre = 'tous'; // tous | manquants | presents
let chrono = null;

export function initAnalysis() {
  const ta = $('#offre-texte');
  ta.value = state.offre = localStorage.getItem('cvtailor.offre') || '';
  const compteur = () => { $('#offre-compteur').textContent = `${ta.value.length.toLocaleString('fr-FR')} caractère${ta.value.length > 1 ? 's' : ''}`; };
  ta.addEventListener('input', () => { state.offre = ta.value; localStorage.setItem('cvtailor.offre', ta.value); compteur(); });
  compteur();
  $('#btn-offre-vider').addEventListener('click', () => { ta.value = ''; ta.dispatchEvent(new Event('input')); ta.focus(); });
  $('#btn-analyser').addEventListener('click', analyser);
  bus.on('analyse', renderAnalyse);
  bus.on('match', renderAnalyse);
  bus.on('doc', renderAnalyse);
  renderAnalyse();
}

async function analyser() {
  const texte = $('#offre-texte').value.trim();
  const err = $('#analyse-erreur');
  err.hidden = true;
  if (texte.length < 80) { err.hidden = false; err.textContent = "Colle d'abord le texte complet de l'offre (80 caractères minimum)."; return; }
  const btn = $('#btn-analyser');
  btn.disabled = true;
  $('#analyse-progress').hidden = false;
  const t0 = Date.now();
  chrono = setInterval(() => { $('#analyse-chrono').textContent = `${Math.round((Date.now() - t0) / 1000)} s`; }, 500);
  try {
    const res = await api.analyse(texte);
    state.analyse = res.analyse;
    state.analyseInfo = { dureeMs: res.dureeMs, modele: res.modele, standalone: true };
    bus.emit('analyse');
    activateTab('analyse');
    toast(`Analyse terminée en ${Math.round(res.dureeMs / 1000)} s · ${res.analyse.mots_cles.length} mots-clés`, { type: 'success' });
  } catch (e) {
    err.hidden = false; err.textContent = e.message;
  } finally {
    clearInterval(chrono);
    $('#analyse-progress').hidden = true;
    btn.disabled = false;
  }
}

export function renderAnalyse() {
  const panel = $('#analyse-panel');
  const a = state.analyse;
  const badge = $('#badge-analyse');
  if (!a) {
    panel.innerHTML = '<div class="empty">Aucune analyse pour l\'instant. Colle une offre dans l\'onglet <b>Offre</b> puis clique <b>Analyser</b>.</div>';
    badge.hidden = true;
    return;
  }
  badge.hidden = false; badge.textContent = a.mots_cles.length;
  const doc = state.doc;
  const match = state.match;
  const isCand = doc && doc.kind === 'candidature';
  const standalone = state.analyseInfo && state.analyseInfo.standalone;

  panel.innerHTML = '';
  // En-tête
  panel.append(el('div', { class: 'an-head' },
    el('h2', {}, a.titre_poste || 'Poste'),
    el('div', { class: 'meta' },
      a.entreprise ? el('span', {}, a.entreprise) : null,
      a.lieu ? el('span', {}, a.lieu) : null,
      a.type_contrat ? el('span', {}, a.type_contrat) : null,
      el('span', { class: 'tag lang' }, a.langue),
      state.analyseInfo && state.analyseInfo.dureeMs ? el('span', { class: 'muted' }, `${Math.round(state.analyseInfo.dureeMs / 1000)} s`) : null)));
  if (a.resume) panel.append(el('div', { class: 'an-resume' }, a.resume));

  // Actions
  const actions = el('div', { class: 'an-actions' });
  actions.append(el('button', { class: 'btn primary', onClick: () => creerCandidature(a) }, '＋ Créer une candidature'));
  if (isCand && standalone) actions.append(el('button', { class: 'btn', onClick: () => appliquerACandidature(a) }, 'Appliquer à la candidature ouverte'));
  actions.append(el('button', { class: 'btn ghost', onClick: () => activateTab('offre') }, "Voir l'offre"));
  panel.append(actions);

  // Score
  if (match) {
    panel.append(el('div', { class: 'an-score' },
      el('strong', {}, `Score ATS ${match.score} %`),
      el('div', { class: 'gauge' }, el('div', { style: `width:${match.score}%` })),
      el('span', { class: 'muted' }, `${match.nbTrouves}/${match.total}`)));
  } else if (!doc) {
    panel.append(el('p', { class: 'hint' }, 'Ouvre un modèle ou crée une candidature pour voir quels mots-clés sont déjà présents dans ton CV.'));
  }

  // Mots-clés
  const found = new Set((match ? match.trouves : []).map((k) => k.terme));
  const kwSection = el('div', { class: 'an-section' });
  const filters = el('div', { class: 'filters' },
    ...[['tous', 'Tous'], ['manquants', 'Manquants'], ['presents', 'Présents']].map(([k, lbl]) =>
      el('button', { class: `btn small ghost ${filtre === k ? 'active' : ''}`, onClick: () => { filtre = k; renderAnalyse(); } }, lbl)));
  kwSection.append(el('h3', {}, el('span', {}, `Mots-clés (${a.mots_cles.length})`), match ? filters : null));
  const sorted = [...a.mots_cles].sort((x, y) => (WEIGHTS[y.importance] || 0) - (WEIGHTS[x.importance] || 0) || (found.has(x.terme) - found.has(y.terme)));
  const kws = el('div', { class: 'kws' });
  for (const k of sorted) {
    const isFound = found.has(k.terme);
    if (match && filtre === 'manquants' && isFound) continue;
    if (match && filtre === 'presents' && !isFound) continue;
    kws.append(el('button', {
      class: `kw-chip ${match ? (isFound ? 'found' : 'missing') : ''}`, dataset: { importance: k.importance },
      title: `${k.categorie} · importance ${k.importance}${k.variantes.length ? `\nVariantes : ${k.variantes.join(', ')}` : ''}\nClic : copier`,
      onClick: () => copyText(k.terme),
    }, el('i', { class: 'imp' }), k.terme, el('span', { class: 'cat' }, CATEGORIES[k.categorie] || k.categorie)));
  }
  if (!kws.children.length) kws.append(el('span', { class: 'muted' }, 'Rien dans ce filtre.'));
  kwSection.append(kws, el('div', { class: 'legend' },
    el('span', {}, el('i', { style: 'background:#dc2626' }), 'haute'), el('span', {}, el('i', { style: 'background:#f59e0b' }), 'moyenne'), el('span', {}, el('i', { style: 'background:#9ca3af' }), 'basse'),
    match ? el('span', {}, 'vert = présent dans le CV') : null));
  panel.append(kwSection);

  // Exigences
  if (a.exigences && a.exigences.length) {
    panel.append(el('div', { class: 'an-section' }, el('h3', {}, 'Exigences'),
      el('ul', { class: 'an-list' }, ...a.exigences.map((e) => el('li', {}, e.texte, e.obligatoire ? el('span', { class: 'oblig' }, 'obligatoire') : null)))));
  }
  // Conseils
  if (a.conseils && a.conseils.length) {
    panel.append(el('div', { class: 'an-section' }, el('h3', {}, 'Conseils pour adapter le CV'),
      el('ul', { class: 'an-list' }, ...a.conseils.map((c) => el('li', {}, c)))));
  }
}

async function creerCandidature(analyse) {
  const dlg = $('#dlg-modele');
  const sel = $('#dlg-modele-select');
  sel.innerHTML = '';
  $('#dlg-modele-sous-titre').textContent = `${analyse.titre_poste}${analyse.entreprise ? ` · ${analyse.entreprise}` : ''}`;
  if (!state.modeles.length) { toast("Crée d'abord un modèle de CV (onglet Modèles).", { type: 'error' }); activateTab('modeles'); return; }
  // Score de chaque modèle face à l'offre, pour choisir le meilleur point de départ.
  const scored = await Promise.all(state.modeles.map(async (m) => {
    try { const cv = await api.modele(m.id); return { m, score: computeMatch(analyse, cvToText(cv)).score }; } catch { return { m, score: null }; }
  }));
  scored.sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
  for (const { m, score } of scored) sel.append(el('option', { value: m.id }, `${m.nom} (${m.langue.toUpperCase()})${score != null ? ` — ATS ${score} %` : ''}`));
  const current = state.doc && state.doc.kind === 'modele' ? state.doc.id : null;
  if (current && state.modeles.some((m) => m.id === current)) sel.value = current;
  dlg.returnValue = '';
  dlg.showModal();
  await new Promise((r) => dlg.addEventListener('close', r, { once: true }));
  if (dlg.returnValue !== 'ok') return;
  try {
    const c = await api.createCandidature({ modeleId: sel.value, offre: state.offre, analyse });
    await refreshLists();
    await openCandidature(c.id);
    toast('Candidature créée. Le CV est une copie du modèle : adapte-le librement.', { type: 'success' });
  } catch (e) { toast(e.message, { type: 'error' }); }
}

async function appliquerACandidature(analyse) {
  const doc = state.doc;
  if (!doc || doc.kind !== 'candidature') return;
  try {
    await api.updateCandidature(doc.id, { analyse, offre: state.offre, meta: { entreprise: analyse.entreprise || doc.meta.entreprise, poste: analyse.titre_poste || doc.meta.poste, langue: analyse.langue } });
    state.analyseInfo = { ...state.analyseInfo, standalone: false };
    bus.emit('analyse');
    toast('Analyse remplacée dans la candidature.', { type: 'success' });
    refreshLists();
  } catch (e) { toast(e.message, { type: 'error' }); }
}
