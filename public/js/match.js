// Détection des mots-clés dans le CV et score ATS. Partagé client (et testable côté Node).
// Voir docs/06-analyse-ia.md § Score ATS.

export const WEIGHTS = { haute: 3, moyenne: 2, basse: 1 };

/** Normalisation symétrique : minuscules, sans accents, ponctuation → espaces, tirets → espaces. */
export function normalize(str) {
  if (!str) return '';
  let s = String(str).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  s = s.replace(/[’'`]/g, ' ');
  s = s.replace(/[^\p{L}\p{N}+#.]/gu, ' ');
  // Points : conservés uniquement entre deux caractères alphanumériques (node.js, .net reste ".net" via le cas spécial)
  s = s.replace(/\.(?![a-z0-9])/g, ' ').replace(/(^|\s)\.(?=[a-z])/g, '$1.');
  return ` ${s.replace(/\s+/g, ' ').trim()} `;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex pour un terme déjà normalisé : frontières de mots, pluriel toléré. */
export function termRegex(normTerm, flags = 'g') {
  const t = normTerm.trim();
  if (!t) return null;
  const body = t.split(' ').map((w) => `${escapeRe(w)}(?:s|es)?`).join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}+#])${body}(?![\\p{L}\\p{N}+#])`, flags + 'u');
}

/** Liste des formes à tester pour un mot-clé (terme + variantes), normalisées et dédupliquées. */
export function keywordForms(kw) {
  const forms = [kw.terme, ...(Array.isArray(kw.variantes) ? kw.variantes : [])]
    .map((f) => normalize(f).trim())
    .filter((f) => f.length >= 2);
  return [...new Set(forms)];
}

/**
 * @param {object} analyse  sortie de Claude (mots_cles[])
 * @param {string} text     texte brut du CV
 * @returns {{score:number, total:number, nbTrouves:number, trouves:Array, manquants:Array}}
 */
export function computeMatch(analyse, text) {
  const norm = normalize(text);
  const kws = (analyse && Array.isArray(analyse.mots_cles)) ? analyse.mots_cles : [];
  let sumW = 0; let sumFound = 0;
  const trouves = []; const manquants = [];
  for (const kw of kws) {
    const w = WEIGHTS[kw.importance] || 1;
    sumW += w;
    const forms = keywordForms(kw);
    const hit = forms.find((f) => { const re = termRegex(f, ''); return re && re.test(norm); });
    if (hit) { sumFound += w; trouves.push({ ...kw, forme: hit }); } else manquants.push(kw);
  }
  const rank = (k) => -(WEIGHTS[k.importance] || 1);
  trouves.sort((a, b) => rank(a) - rank(b));
  manquants.sort((a, b) => rank(a) - rank(b));
  return {
    score: sumW ? Math.round((sumFound / sumW) * 100) : 0,
    total: kws.length,
    nbTrouves: trouves.length,
    trouves,
    manquants,
  };
}

/** Texte brut d'un fragment HTML rendu (côté navigateur). */
export function textOfElement(el) {
  return el ? el.innerText || el.textContent || '' : '';
}

/**
 * Surligne dans le DOM les occurrences des mots-clés trouvés.
 * Travaille sur les nœuds texte, ignore script/style/mark. Réversible : on re-rend le CV à chaque fois.
 */
export function highlightDom(root, trouves) {
  if (!root || !trouves || !trouves.length) return;
  const forms = [];
  for (const kw of trouves) for (const f of keywordForms(kw)) forms.push({ f, imp: kw.importance || 'moyenne' });
  forms.sort((a, b) => b.f.length - a.f.length);
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentNode && node.parentNode.nodeName;
      if (!node.nodeValue.trim() || p === 'SCRIPT' || p === 'STYLE' || p === 'MARK') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const original = node.nodeValue;
    // On travaille sur une version normalisée caractère à caractère : on construit une table d'index.
    const { norm, map } = normalizeWithMap(original);
    const ranges = [];
    for (const { f, imp } of forms) {
      const re = termRegex(f, 'g');
      if (!re) continue;
      let m;
      while ((m = re.exec(norm))) {
        const start = map[m.index]; const end = map[m.index + m[0].length - 1] + 1;
        if (start == null || end == null) continue;
        if (!ranges.some((r) => start < r.end && end > r.start)) ranges.push({ start, end, imp });
        if (m[0].length === 0) re.lastIndex += 1;
      }
    }
    if (!ranges.length) continue;
    ranges.sort((a, b) => a.start - b.start);
    const frag = root.ownerDocument.createDocumentFragment();
    let cursor = 0;
    for (const r of ranges) {
      if (r.start > cursor) frag.appendChild(root.ownerDocument.createTextNode(original.slice(cursor, r.start)));
      const mark = root.ownerDocument.createElement('mark');
      mark.className = 'kw';
      mark.dataset.importance = r.imp;
      mark.textContent = original.slice(r.start, r.end);
      frag.appendChild(mark);
      cursor = r.end;
    }
    if (cursor < original.length) frag.appendChild(root.ownerDocument.createTextNode(original.slice(cursor)));
    node.parentNode.replaceChild(frag, node);
  }
}

/** Normalise en conservant, pour chaque caractère normalisé, l'index du caractère d'origine. */
function normalizeWithMap(str) {
  let norm = ''; const map = [];
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    let n = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (/[’'`]/.test(n)) n = ' ';
    else if (!/[\p{L}\p{N}+#.]/u.test(n)) n = ' ';
    if (n === '.') {
      const next = str[i + 1] || ' ';
      const prev = str[i - 1] || ' ';
      if (!/[\p{L}\p{N}]/u.test(next) || (!/[\p{L}\p{N}]/u.test(prev) && !/[a-z]/i.test(next))) n = ' ';
    }
    for (const c of n) { norm += c; map.push(i); }
  }
  return { norm, map };
}
