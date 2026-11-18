// Correcteur d'orthographe / grammaire via la CLI Claude Code. Voir docs/11-correcteur.md.
// Le CV (ou la lettre) est aplati en champs numérotés ; Claude renvoie des corrections ciblées
// (fragment fautif → correction) que le client applique une par une, sans réécriture globale.
import { DATA } from './store.js';
import { runClaude, httpError } from './claude.js';

export const CATEGORIES = ['orthographe', 'grammaire', 'accord', 'conjugaison', 'ponctuation', 'typographie'];

export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['problemes'],
  properties: {
    problemes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['champ', 'fautif', 'correction', 'categorie', 'explication'],
        properties: {
          champ: { type: 'integer' },
          fautif: { type: 'string' },
          correction: { type: 'string' },
          categorie: { type: 'string', enum: CATEGORIES },
          explication: { type: 'string' },
        },
      },
    },
  },
};

export const SYSTEM_PROMPT = `Tu es un correcteur professionnel (orthographe, grammaire, accords, conjugaison, ponctuation, typographie) spécialisé dans les CV et lettres de motivation. On te donne des champs de texte numérotés, au format "[numéro] texte". Tu signales uniquement les VRAIES fautes.

Règles :
- Le texte est dans la langue indiquée. Applique les règles de cette langue (en français : espaces insécables avant ; : ! ? et « », apostrophes, accords, participes passés ; en anglais : orthographe cohérente, une seule variante US ou UK par document).
- Ne touche jamais au style, au ton, au choix des mots ni à la longueur : pas de reformulation, pas d'amélioration. Uniquement des fautes objectives.
- Ignore : noms propres, noms d'entreprises et de produits, technologies et outils (Node.js, CI/CD, GitHub…), sigles, URL, e-mails, chiffres, dates, fragments d'une autre langue manifestement voulus. En cas de doute, ne signale pas.
- Les puces de CV sont des phrases nominales ou à l'infinitif sans point final : ce n'est pas une faute. Vérifie seulement la cohérence d'une liste à l'autre (majuscules et ponctuation finale) si l'écart est flagrant.
- "fautif" est un fragment COPIÉ EXACTEMENT depuis le champ (même casse, mêmes espaces), le plus court possible mais assez long pour être unique dans le champ (le mot fautif, ou le groupe de mots pour un accord). "correction" remplace ce fragment tel quel.
- "explication" : une phrase courte, en français, qui nomme la règle ou l'erreur.
- Un objet par faute. Si le texte est correct, renvoie une liste vide.
Réponds uniquement avec le JSON demandé.`;

// ---------- Aplatissement du document en champs ----------

const SECTION_LABELS = {
  fr: { resume: 'Profil', experiences: 'Expériences', formations: 'Formations', competences: 'Compétences', projets: 'Projets', langues: 'Langues', certifications: 'Certifications', interets: 'Centres d\'intérêt', identite: 'Identité', titres: 'Titres de sections' },
  en: { resume: 'Summary', experiences: 'Experience', formations: 'Education', competences: 'Skills', projets: 'Projects', langues: 'Languages', certifications: 'Certifications', interets: 'Interests', identite: 'Identity', titres: 'Section titles' },
};
const LETTER_LABELS = { objet: 'Objet', salutation: 'Salutation', paragraphes: 'Paragraphe', formule: 'Formule de politesse' };

// Clés jamais relues : identifiants techniques, liens, coordonnées, dates, noms de fichiers.
const SKIP_KEYS = new Set(['id', 'template', 'langue', 'sections', 'nom', 'url', 'lien', 'liens', 'email', 'telephone', 'adresse', 'debut', 'fin', 'date', 'prenom', 'lieu', 'entreprise', 'etablissement', 'organisme', 'label']);
// Mais ces clés-là de l'identité méritent une relecture (le titre professionnel surtout).
const KEEP_IDENTITE = new Set(['titre']);

const MIN_LEN = 4;

function itemTitle(item) {
  if (!item || typeof item !== 'object') return '';
  return [item.poste || item.diplome || item.nom || item.categorie || item.langue, item.entreprise || item.etablissement || item.organisme].filter(Boolean).join(' · ');
}

/** Liste plate { chemin, label, texte } des chaînes à relire dans un CV. */
export function collectCvFields(cv) {
  const lang = cv.langue === 'en' ? 'en' : 'fr';
  const labels = SECTION_LABELS[lang];
  const out = [];
  const push = (chemin, label, texte) => {
    if (typeof texte === 'string' && texte.trim().length >= MIN_LEN) out.push({ chemin, label, texte });
  };
  const walk = (value, chemin, top, ctx) => {
    if (typeof value === 'string') return push(chemin, ctx ? `${labels[top] || top} › ${ctx}` : (labels[top] || top), value);
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        const title = typeof v === 'object' && v ? itemTitle(v) : '';
        walk(v, [...chemin, i], top, title || ctx || (typeof v === 'string' && top !== 'resume' ? `n° ${i + 1}` : ''));
      });
      return undefined;
    }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (top === 'identite' ? !KEEP_IDENTITE.has(k) : SKIP_KEYS.has(k)) continue;
        walk(v, [...chemin, k], top, ctx);
      }
    }
    return undefined;
  };
  for (const key of ['identite', 'resume', 'experiences', 'formations', 'competences', 'projets', 'certifications', 'interets', 'titres']) {
    if (key in cv) walk(cv[key], [key], key, '');
  }
  return out;
}

/** Même chose pour une lettre de motivation. */
export function collectLetterFields(lettre) {
  const out = [];
  const push = (chemin, label, texte) => {
    if (typeof texte === 'string' && texte.trim().length >= MIN_LEN) out.push({ chemin, label, texte });
  };
  push(['objet'], LETTER_LABELS.objet, lettre.objet);
  push(['salutation'], LETTER_LABELS.salutation, lettre.salutation);
  (lettre.paragraphes || []).forEach((p, i) => push(['paragraphes', i], `${LETTER_LABELS.paragraphes} ${i + 1}`, p));
  push(['formule'], LETTER_LABELS.formule, lettre.formule);
  return out;
}

// ---------- Vérification ----------

const LANG_NAMES = { fr: 'français', en: 'anglais' };

/**
 * @param {object} p
 * @param {'cv'|'lettre'} p.type
 * @param {object} p.document  le CV ou la lettre (JSON)
 * @returns {Promise<{problemes:object[], nbChamps:number, dureeMs:number, modele:string|null}>}
 */
export async function checkSpelling({ type, document, config }) {
  if (!document || typeof document !== 'object') throw httpError(400, 'Document à vérifier manquant.');
  const isLettre = type === 'lettre';
  const lang = document.langue === 'en' ? 'en' : 'fr';
  const champs = isLettre ? collectLetterFields(document) : collectCvFields(document);
  if (!champs.length) return { problemes: [], nbChamps: 0, dureeMs: 0, modele: null };

  const prompt = [
    `Type de document : ${isLettre ? 'lettre de motivation' : 'CV'}`,
    `Langue : ${LANG_NAMES[lang]} (${lang})`,
    '',
    ...champs.map((c, i) => `[${i}] ${c.texte.replace(/\s*\n\s*/g, ' ')}`),
  ].join('\n');

  const { sortie, dureeMs, modele } = await runClaude({ config, cwd: DATA, schema: SCHEMA, system: SYSTEM_PROMPT, prompt });
  return { problemes: sanitize(sortie.problemes, champs), nbChamps: champs.length, dureeMs, modele };
}

/** Écarte toute correction incohérente : champ inconnu, fragment absent du texte, correction identique. */
function sanitize(raw, champs) {
  const seen = new Set();
  const out = [];
  for (const p of Array.isArray(raw) ? raw : []) {
    const champ = champs[p?.champ];
    const fautif = typeof p?.fautif === 'string' ? p.fautif : '';
    const correction = typeof p?.correction === 'string' ? p.correction : '';
    if (!champ || !fautif || fautif === correction || !champ.texte.includes(fautif)) continue;
    const key = `${p.champ}\u0000${fautif}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      chemin: champ.chemin,
      label: champ.label,
      texte: champ.texte,
      fautif,
      correction,
      categorie: CATEGORIES.includes(p.categorie) ? p.categorie : 'orthographe',
      explication: typeof p.explication === 'string' ? p.explication.trim().slice(0, 300) : '',
    });
  }
  return out;
}
