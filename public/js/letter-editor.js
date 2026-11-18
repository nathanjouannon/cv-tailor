// Éditeur de la lettre de motivation (panneau droit, vue « Lettre ») : génération par Claude + édition manuelle.
import { el, $, toast } from './state.js';
import { api } from './api.js';
import { bindSpotlight, collapseBar } from './editor-ui.js';
import { LETTER_LANGS, LETTER_TONES, formatLetterDate } from './letter.js';

const openSections = new Set(['generer', 'contenu']);

/**
 * @param {object} doc   document courant (kind 'candidature', doc.lettre déjà initialisée)
 * @param {object} h     { onChange(), onGenerated(), save() }
 */
export function buildLetterEditor(doc, h) {
  const root = $('#editor');
  const scrollTop = root.scrollTop;
  root.innerHTML = '';
  root.append(generateSection(doc, h), contentSection(doc, h), recipientSection(doc, h), senderSection(doc, h));
  root.prepend(collapseBar(root, openSections).bar);
  root.scrollTop = scrollTop;
}

// ---------- Helpers ----------
function shell(id, title, body) {
  const sec = el('div', { class: `ed-section ${openSections.has(id) ? 'open' : ''}`, dataset: { section: id } });
  const head = el('div', { class: 'ed-head' }, el('span', { class: 'caret' }, '▶'),
    el('span', { class: 'ed-title-wrap' }, el('span', { class: 'ed-title' }, title)));
  head.addEventListener('click', () => {
    sec.classList.toggle('open');
    if (sec.classList.contains('open')) openSections.add(id); else openSections.delete(id);
  });
  bindSpotlight(head, id);
  sec.append(head, el('div', { class: 'ed-body' }, body));
  return sec;
}
function bind(input, get, set, onChange) {
  input.value = get() ?? '';
  input.addEventListener('input', () => { set(input.value); onChange(); });
  return input;
}
const field = (label, input) => el('label', { class: 'field' }, el('span', {}, label), input);
const text = (obj, key, onChange, placeholder = '') => bind(el('input', { type: 'text', placeholder }), () => obj[key], (v) => { obj[key] = v; }, onChange);
const area = (obj, key, onChange, cls = '') => bind(el('textarea', { class: cls }), () => obj[key], (v) => { obj[key] = v; }, onChange);

// ---------- Génération ----------
function generateSection(doc, h) {
  const l = doc.lettre;
  const aDuTexte = l.paragraphes.some((p) => p.trim());
  const a = doc.analyse;
  const langue = el('select', {}, ...Object.entries(LETTER_LANGS).map(([k, v]) => el('option', { value: k }, v)));
  langue.value = aDuTexte ? l.langue : (a?.langue || doc.cv.langue || 'fr');
  const ton = el('select', {}, ...Object.entries(LETTER_TONES).map(([k, v]) => el('option', { value: k }, v)));
  ton.value = l.ton;
  const consignes = el('textarea', { placeholder: "Facultatif. Ex. : insister sur mon expérience en e-commerce ; mentionner que je suis disponible dès janvier ; ne pas parler de mon stage…" });
  consignes.value = l.consignes;
  const err = el('div', { class: 'alert error', hidden: true });
  const progress = el('div', { class: 'progress', hidden: true }, el('div', { class: 'spinner' }), el('span', {}, 'Rédaction en cours… '), el('span', { class: 'muted' }, '0 s'));
  const btn = el('button', { class: 'btn primary', type: 'button' }, aDuTexte ? '✦ Régénérer avec Claude' : '✦ Générer avec Claude');

  btn.addEventListener('click', async () => {
    err.hidden = true;
    if (aDuTexte && !confirm('Régénérer remplace l\'objet, la salutation, les paragraphes et la formule actuels, y compris tes modifications. Continuer ?')) return;
    btn.disabled = true; progress.hidden = false;
    const t0 = Date.now();
    const chrono = setInterval(() => { progress.lastChild.textContent = `${Math.round((Date.now() - t0) / 1000)} s`; }, 500);
    try {
      await h.save(); // le serveur lit le CV enregistré de la candidature
      const res = await api.genererLettre(doc.id, { langue: langue.value, ton: ton.value, consignes: consignes.value });
      doc.lettre = res.lettre;
      h.onGenerated();
      toast(`Lettre générée en ${Math.round(res.dureeMs / 1000)} s`, { type: 'success' });
    } catch (e) {
      err.hidden = false; err.textContent = e.message;
    } finally {
      clearInterval(chrono); progress.hidden = true; btn.disabled = false;
    }
  });

  const body = el('div', {},
    el('div', { class: 'grid2' }, field('Langue de la lettre', langue), field('Ton', ton)),
    field('Consignes pour Claude', consignes),
    el('div', { class: 'row end' }, btn), progress, err,
    el('p', { class: 'ed-note' }, "Le CV de cette candidature, l'analyse et le texte de l'offre sont envoyés à Claude (via ta commande claude) pour rédiger la lettre. Rien n'est inventé : il s'appuie sur ton CV. Une fois générée, la lettre est entièrement modifiable ci-dessous."));
  return shell('generer', 'Génération', body);
}

// ---------- Contenu ----------
function contentSection(doc, h) {
  const l = doc.lettre;
  const list = el('div', {});
  const move = (i, j) => { if (j < 0 || j >= l.paragraphes.length) return; const [x] = l.paragraphes.splice(i, 1); l.paragraphes.splice(j, 0, x); renderParas(); h.onChange(); };
  const renderParas = () => {
    list.innerHTML = '';
    l.paragraphes.forEach((_, i) => {
      const ta = bind(el('textarea', { class: 'points', placeholder: 'Paragraphe…' }), () => l.paragraphes[i], (v) => { l.paragraphes[i] = v; }, h.onChange);
      list.append(el('div', { class: 'ed-item' },
        el('div', { class: 'ed-item-head' }, el('span', { class: 'idx' }, `Paragraphe ${i + 1}`),
          el('button', { class: 'btn icon ghost', type: 'button', title: 'Monter', disabled: i === 0, onClick: () => move(i, i - 1) }, '↑'),
          el('button', { class: 'btn icon ghost', type: 'button', title: 'Descendre', disabled: i === l.paragraphes.length - 1, onClick: () => move(i, i + 1) }, '↓'),
          el('button', { class: 'btn icon ghost danger', type: 'button', title: 'Supprimer', onClick: () => { l.paragraphes.splice(i, 1); renderParas(); h.onChange(); } }, '✕')),
        ta));
    });
    list.append(el('button', { class: 'btn small ed-add', type: 'button', onClick: () => { l.paragraphes.push(''); renderParas(); h.onChange(); } }, '+ Ajouter un paragraphe'));
  };
  renderParas();
  const body = el('div', {},
    field('Objet', text(l, 'objet', h.onChange)),
    field('Salutation', text(l, 'salutation', h.onChange, 'Madame, Monsieur,')),
    list,
    field('Formule de politesse', area(l, 'formule', h.onChange)),
    field('Signature', text(l, 'signature', h.onChange)));
  return shell('contenu', 'Contenu de la lettre', body);
}

// ---------- Destinataire ----------
function recipientSection(doc, h) {
  const d = doc.lettre.destinataire;
  return shell('destinataire', 'Destinataire', el('div', {},
    el('div', { class: 'grid2' }, field('Nom du contact', text(d, 'nom', h.onChange)), field('Fonction', text(d, 'fonction', h.onChange))),
    field('Entreprise', text(d, 'entreprise', h.onChange)),
    field('Adresse', area(d, 'adresse', h.onChange))));
}

// ---------- Expéditeur & date ----------
function senderSection(doc, h) {
  const l = doc.lettre;
  const e = l.expediteur;
  const date = text(l, 'date', h.onChange);
  return shell('expediteur', 'Expéditeur et date', el('div', {},
    el('div', { class: 'grid2' }, field('Nom', text(e, 'nom', h.onChange)), field('Téléphone', text(e, 'telephone', h.onChange))),
    field('Email', text(e, 'email', h.onChange)),
    field('Adresse', area(e, 'adresse', h.onChange)),
    el('div', { class: 'grid2' }, field('Lieu', text(l, 'lieu', h.onChange, 'ex. Lyon')), field('Date', date)),
    el('button', { class: 'btn small', type: 'button', onClick: () => { l.date = formatLetterDate(l.langue); date.value = l.date; h.onChange(); } }, "Mettre la date d'aujourd'hui")));
}
