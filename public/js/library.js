// Panneau gauche : listes des modèles et des candidatures.
import { state, bus, $, el, toast, formatDate, download, STATUTS } from './state.js';
import { api } from './api.js';
import { openModele, openCandidature, closeDoc } from './doc.js';
import { DEFAULT_SECTIONS } from './render.js';

export async function refreshLists() {
  [state.modeles, state.candidatures] = await Promise.all([api.modeles(), api.candidatures()]);
  renderModeles();
  renderCandidatures();
}

/** Recharge la liste des templates (après un import) et la liste déroulante de l'éditeur. */
export async function refreshTemplates() {
  state.templates = await api.templates();
  const sel = $('#sel-template');
  const courant = state.doc?.cv?.template || sel.value;
  sel.innerHTML = '';
  state.templates.forEach((t) => sel.append(el('option', { value: t.id, title: t.description || '' }, t.nom)));
  if (courant && state.templates.some((t) => t.id === courant)) sel.value = courant;
}

export function initLibrary() {
  $('#btn-modele-nouveau').addEventListener('click', nouveauModele);
  $('#btn-modele-importer').addEventListener('click', () => $('#input-import-json').click());
  $('#input-import-json').addEventListener('change', importerFichiers);
  $('#btn-ouvrir-dossier-cand').addEventListener('click', () => api.ouvrirDossier(`${state.sante?.data || ''}/candidatures`).catch((e) => toast(e.message, { type: 'error' })));
  bus.on('doc', () => { renderModeles(); renderCandidatures(); });
  bus.on('saved', () => refreshLists());
}

function renderModeles() {
  const box = $('#liste-modeles');
  box.innerHTML = '';
  if (!state.modeles.length) { box.append(el('div', { class: 'empty' }, 'Aucun modèle. Clique « + Nouveau » ou importe un JSON.')); return; }
  for (const m of state.modeles) {
    const active = state.doc && state.doc.kind === 'modele' && state.doc.id === m.id;
    box.append(el('div', { class: `card ${active ? 'active' : ''}` },
      el('div', { class: 'row between' }, el('span', { class: 'card-title' }, m.nom), el('span', { class: 'tag lang' }, m.langue)),
      el('div', { class: 'card-sub' }, [m.titre, `template ${m.template}`, `modifié le ${formatDate(m.modifie)}`].filter(Boolean).join(' · ')),
      el('div', { class: 'card-actions' },
        el('button', { class: 'btn small primary', onClick: () => openModele(m.id).catch((e) => toast(e.message, { type: 'error' })) }, active ? 'Ouvert' : 'Ouvrir'),
        el('button', { class: 'btn small ghost', onClick: async () => { await api.duplicateModele(m.id); refreshLists(); } }, 'Dupliquer'),
        el('button', { class: 'btn small ghost', onClick: async () => { const cv = await api.modele(m.id); download(`${m.id}.json`, JSON.stringify(cv, null, 2)); } }, 'JSON'),
        el('button', { class: 'btn small ghost danger', onClick: () => supprimerModele(m) }, 'Supprimer'))));
  }
}

function renderCandidatures() {
  const box = $('#liste-candidatures');
  box.innerHTML = '';
  if (!state.candidatures.length) { box.append(el('div', { class: 'empty' }, "Aucune candidature. Analyse une offre puis clique « Créer une candidature ».")); return; }
  for (const c of state.candidatures) {
    const active = state.doc && state.doc.kind === 'candidature' && state.doc.id === c.id;
    const statut = el('select', { class: 'statut', title: 'Statut' }, ...STATUTS.map((s) => el('option', { value: s, selected: s === c.statut }, s)));
    statut.addEventListener('change', async () => { await api.updateCandidature(c.id, { meta: { statut: statut.value } }); c.statut = statut.value; });
    box.append(el('div', { class: `card ${active ? 'active' : ''}` },
      el('div', { class: 'row between' },
        el('span', { class: 'card-title' }, `${c.poste || 'Poste'}${c.entreprise ? ` · ${c.entreprise}` : ''}`),
        el('span', { class: 'row' }, c.score != null ? el('span', { class: 'tag' }, `ATS ${c.score} %`) : null, el('span', { class: 'tag lang' }, c.langue || 'fr'))),
      el('div', { class: 'card-sub' }, `créée le ${formatDate(c.creeLe)} · modifiée le ${formatDate(c.modifieLe)}${c.pdf ? ` · PDF : ${c.pdf}` : ''}`),
      el('div', { class: 'card-actions' },
        el('button', { class: 'btn small primary', onClick: () => openCandidature(c.id).catch((e) => toast(e.message, { type: 'error' })) }, active ? 'Ouverte' : 'Ouvrir'),
        statut,
        c.pdf ? el('a', { class: 'btn small ghost', href: `/api/exports/${encodeURIComponent(c.pdf)}`, target: '_blank' }, 'PDF') : null,
        c.lettrePdf ? el('a', { class: 'btn small ghost', href: `/api/exports/${encodeURIComponent(c.lettrePdf)}`, target: '_blank' }, 'Lettre PDF') : null,
        el('button', { class: 'btn small ghost danger', onClick: () => supprimerCandidature(c) }, 'Supprimer'))));
  }
}

async function nouveauModele() {
  const nom = prompt('Nom du nouveau modèle :', 'Mon CV');
  if (!nom) return;
  const cv = {
    nom, langue: 'fr', template: 'classique',
    identite: { prenom: '', nom: '', titre: '', email: '', telephone: '', adresse: '', liens: [] },
    resume: '', sections: [...DEFAULT_SECTIONS],
    experiences: [], formations: [], competences: [], projets: [], langues: [], certifications: [], interets: [],
  };
  try { const created = await api.createModele(cv); await refreshLists(); await openModele(created.id); } catch (e) { toast(e.message, { type: 'error' }); }
}

async function importerFichiers(e) {
  const files = [...e.target.files];
  e.target.value = '';
  let ok = 0;
  for (const f of files) {
    try {
      const cv = JSON.parse(await f.text());
      if (!cv || typeof cv !== 'object' || !cv.identite) throw new Error('structure inattendue (champ identite manquant)');
      await api.createModele({ ...cv, nom: cv.nom || f.name.replace(/\.json$/i, '') });
      ok += 1;
    } catch (err) { toast(`${f.name} : ${err.message}`, { type: 'error', duration: 7000 }); }
  }
  if (ok) { toast(`${ok} modèle${ok > 1 ? 's' : ''} importé${ok > 1 ? 's' : ''}`, { type: 'success' }); refreshLists(); }
}

async function supprimerModele(m) {
  if (!confirm(`Supprimer le modèle « ${m.nom} » ? Les candidatures déjà créées ne sont pas affectées.`)) return;
  if (state.doc && state.doc.kind === 'modele' && state.doc.id === m.id) { state.dirty = false; await closeDoc(); }
  await api.deleteModele(m.id);
  refreshLists();
}

async function supprimerCandidature(c) {
  if (!confirm(`Supprimer la candidature « ${c.poste} · ${c.entreprise} » et son dossier (offre, analyse, CV, PDF) ?`)) return;
  if (state.doc && state.doc.kind === 'candidature' && state.doc.id === c.id) { state.dirty = false; await closeDoc(); }
  await api.deleteCandidature(c.id);
  refreshLists();
}
