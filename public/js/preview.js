// Aperçu A4 : rendu du template, mise à l'échelle, débordement, score et surlignage.
import { state, bus, $ } from './state.js';
import { api } from './api.js';
import { render } from './render.js';
import { computeMatch, highlightDom, textOfElement } from './match.js';
import { renderLetter, LETTER_CSS } from './letter.js';

const PAGE_H_PX = (297 / 25.4) * 96; // 1122.5 px
const templateCache = new Map();

export async function ensureTemplate(id) {
  const key = id || 'classique';
  if (!templateCache.has(key)) {
    templateCache.set(key, api.template(key).catch(async (e) => {
      templateCache.delete(key);
      if (key !== 'classique') return ensureTemplate('classique');
      throw e;
    }));
  }
  return templateCache.get(key);
}

export function clearTemplateCache() { templateCache.clear(); }

/** Rend l'aperçu, mesure le débordement, calcule le score et surligne les mots-clés. */
export async function renderPreview() {
  const doc = state.doc;
  const preview = $('#preview');
  if (!doc) { preview.innerHTML = ''; return; }
  const tpl = await ensureTemplate(doc.cv.template);
  if (state.view === 'lettre' && doc.lettre) return renderLetterPreview(doc, tpl, preview);
  state.template = tpl;
  $('#tpl-style').textContent = tpl.css;
  preview.style.setProperty('--accent', tpl.meta.accent || '');
  let html;
  try { html = render(tpl.html, doc.cv); } catch (e) { html = `<article class="cv page"><p style="color:#b91c1c;padding:20mm">Erreur de template : ${e.message}</p></article>`; }
  preview.innerHTML = html;
  preview.lang = doc.cv.langue || 'fr';

  updateOverflow(preview, 'Le CV');

  // Score ATS sur le texte rendu (avant surlignage).
  const analyse = state.analyse;
  if (analyse && analyse.mots_cles && analyse.mots_cles.length) {
    state.match = computeMatch(analyse, textOfElement(preview));
    highlightDom(preview, state.match.trouves);
  } else state.match = null;
  updateScoreChip();
  bus.emit('match', state.match);
  scalePreview();
}

/** Débordement : la page a min-height 297mm, toute hauteur au-delà est un dépassement. */
function updateOverflow(preview, sujet) {
  const page = preview.querySelector('.page') || preview.firstElementChild;
  const h = page ? page.offsetHeight : 0;
  const overflowPx = Math.max(0, h - PAGE_H_PX - 1);
  const chip = $('#chip-overflow');
  if (overflowPx > 0) {
    chip.hidden = false;
    chip.textContent = `Déborde : +${Math.max(1, Math.round(overflowPx / 96 * 25.4))} mm`;
    chip.title = `${sujet} fait ${(h / PAGE_H_PX).toFixed(2)} page A4. Raccourcis le contenu pour tenir sur une page.`;
    if (page) page.append(Object.assign(document.createElement('div'), { className: 'page-limit' }));
  } else chip.hidden = true;
}

/** Aperçu de la lettre : pas de score ATS ni de surlignage ; state.match reste celui du CV (il est enregistré dans la candidature). */
function renderLetterPreview(doc, tpl, preview) {
  $('#tpl-style').textContent = LETTER_CSS;
  preview.style.setProperty('--accent', tpl.meta.accent || '');
  preview.innerHTML = renderLetter(doc.lettre);
  preview.lang = doc.lettre.langue || 'fr';
  updateOverflow(preview, 'La lettre');
  $('#chip-score').hidden = true;
  scalePreview();
}

export function updateScoreChip() {
  const chip = $('#chip-score');
  const m = state.match;
  if (!m) { chip.hidden = true; return; }
  chip.hidden = false;
  chip.textContent = `ATS ${m.score} % · ${m.nbTrouves}/${m.total}`;
  chip.dataset.level = m.score >= 70 ? 'bon' : m.score >= 40 ? 'moyen' : 'bas';
}

/** Met le CV (210 mm) à l'échelle de la largeur disponible. */
export function scalePreview() {
  const wrap = $('#preview-wrap');
  const scale = $('#preview-scale');
  const preview = $('#preview');
  if (!wrap || !preview.firstElementChild) return;
  const pageW = preview.offsetWidth || (210 / 25.4) * 96;
  const avail = wrap.clientWidth - 40;
  const s = Math.min(1, avail / pageW);
  scale.style.transform = `scale(${s})`;
  scale.style.width = `${pageW}px`;
  scale.style.height = `${preview.offsetHeight * s}px`;
}

/** HTML « propre » (sans surlignage) et CSS pour l'export PDF. */
export async function exportableHtml() {
  const doc = state.doc;
  const tpl = await ensureTemplate(doc.cv.template);
  if (state.view === 'lettre' && doc.lettre) return { html: renderLetter(doc.lettre), css: LETTER_CSS, lang: doc.lettre.langue || 'fr', accent: tpl.meta.accent, type: 'lettre' };
  return { html: render(tpl.html, doc.cv), css: tpl.css, lang: doc.cv.langue || 'fr', accent: tpl.meta.accent };
}

/** Texte brut d'un CV à partir du JSON (sans template), pour scorer les modèles avant ouverture. */
export function cvToText(cv) {
  const parts = [];
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === 'string') parts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === 'object') Object.entries(v).forEach(([k, val]) => { if (!['id', 'template', 'langue', 'sections', 'nom'].includes(k)) walk(val); });
  };
  walk(cv);
  return parts.join('\n');
}

window.addEventListener('resize', () => scalePreview());
