// Aides communes aux éditeurs (CV et lettre) : bouton « tout replier » et mise en avant de la zone survolée.
import { state, el, $ } from './state.js';

const LETTER_TARGETS = {
  contenu: ['.l-objet', '.l-salut', '.l-body', '.l-formule', '.l-signature'],
  destinataire: ['.l-to'],
  expediteur: ['.l-from', '.l-date'],
};

function targetsFor(id) {
  if (state.view === 'lettre') return LETTER_TARGETS[id] || [];
  if (id === 'identite') return ['.cv-head'];
  return [`.cv-${id}`];
}

export function clearSpotlight() {
  const o = $('#preview')?.querySelector('.spot-overlay');
  if (o) o.remove();
}

/** Assombrit tout l'aperçu sauf la partie correspondant à la section `id`. */
export function spotlight(id) {
  clearSpotlight();
  const preview = $('#preview');
  const page = preview?.firstElementChild;
  if (!page) return;
  const nodes = targetsFor(id).flatMap((sel) => [...preview.querySelectorAll(sel)]);
  if (!nodes.length) return;
  const pr = preview.getBoundingClientRect();
  const k = pr.width / (preview.offsetWidth || pr.width) || 1; // échelle de l'aperçu
  const W = preview.offsetWidth, H = preview.offsetHeight, pad = 6;
  let d = `M0 0H${W}V${H}H0Z`;
  for (const n of nodes) {
    const r = n.getBoundingClientRect();
    const x = Math.max(0, (r.left - pr.left) / k - pad), y = Math.max(0, (r.top - pr.top) / k - pad);
    const w = Math.min(W - x, r.width / k + pad * 2), h = Math.min(H - y, r.height / k + pad * 2);
    if (w > 0 && h > 0) d += `M${x} ${y}h${w}v${h}h${-w}Z`;
  }
  const overlay = el('div', { class: 'spot-overlay' });
  overlay.style.clipPath = `path(evenodd, '${d}')`;
  preview.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('on'));
}

/** Branche le survol de l'en-tête d'une section sur la mise en avant dans l'aperçu. */
export function bindSpotlight(head, id) {
  head.addEventListener('mouseenter', () => spotlight(id));
  head.addEventListener('mouseleave', clearSpotlight);
}

/** Barre d'outils en tête d'éditeur : replier / déplier toutes les sections. */
export function collapseBar(root, openSet) {
  const btn = el('button', { class: 'btn small', type: 'button' });
  const refresh = () => {
    const anyOpen = !!root.querySelector('.ed-section.open') || openSet.size > 0;
    btn.textContent = anyOpen ? '⇡ Tout replier' : '⇣ Tout déplier';
    btn.dataset.mode = anyOpen ? 'collapse' : 'expand';
  };
  btn.addEventListener('click', () => {
    const collapse = btn.dataset.mode === 'collapse';
    root.querySelectorAll('.ed-section').forEach((s) => {
      s.classList.toggle('open', !collapse);
      if (collapse) openSet.delete(s.dataset.section); else openSet.add(s.dataset.section);
    });
    refresh();
  });
  if (root._edRefresh) root.removeEventListener('click', root._edRefresh);
  root._edRefresh = (e) => { if (e.target.closest('.ed-head')) setTimeout(refresh); };
  root.addEventListener('click', root._edRefresh);
  const bar = el('div', { class: 'ed-bar' }, btn);
  refresh();
  return { bar, refresh };
}
