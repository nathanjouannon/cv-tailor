// Analyse d'une offre d'emploi via la CLI Claude Code (abonnement claude.ai). Voir docs/06-analyse-ia.md.
import { DATA } from './store.js';
import { runClaude, httpError } from './claude.js';

export { claudeStatus } from './claude.js';

export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titre_poste', 'entreprise', 'lieu', 'type_contrat', 'langue', 'resume', 'mots_cles', 'exigences', 'conseils'],
  properties: {
    titre_poste: { type: 'string' },
    entreprise: { type: 'string' },
    lieu: { type: 'string' },
    type_contrat: { type: 'string' },
    langue: { type: 'string', enum: ['fr', 'en'] },
    resume: { type: 'string' },
    mots_cles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['terme', 'categorie', 'importance', 'variantes'],
        properties: {
          terme: { type: 'string' },
          categorie: { type: 'string', enum: ['competence_technique', 'outil', 'soft_skill', 'methodologie', 'certification', 'domaine', 'langue', 'diplome', 'autre'] },
          importance: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
          variantes: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    exigences: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['texte', 'obligatoire'],
        properties: { texte: { type: 'string' }, obligatoire: { type: 'boolean' } },
      },
    },
    conseils: { type: 'array', items: { type: 'string' } },
  },
};

export const SYSTEM_PROMPT = `Tu es un expert du recrutement et des systèmes ATS (Applicant Tracking Systems). On te donne le texte brut d'une offre d'emploi. Tu produis une analyse structurée destinée à adapter un CV pour qu'il passe le filtre ATS de cette offre.

Règles :
- Détecte la langue de l'offre : "fr" ou "en". Les champs titre_poste, entreprise, lieu, type_contrat et tous les mots-clés sont écrits dans la langue de l'offre, avec l'orthographe et la casse exactes qu'un ATS comparerait (ex. "Node.js", "CI/CD", "Scrum"). Le champ resume et les conseils sont toujours en français.
- mots_cles : 15 à 35 entrées, sans doublon, triées par importance décroissante. Chaque entrée a un terme court (1 à 4 mots), une catégorie, une importance et une liste de variantes (synonymes, sigles, forme développée, pluriel, traduction FR/EN courante) utiles pour retrouver le terme dans un CV. Pas de verbes génériques ("gérer", "participer"), pas de mots du bruit ("équipe dynamique").
- importance : "haute" si le terme est répété, dans le titre, ou marqué indispensable/obligatoire/required ; "moyenne" s'il est demandé une fois dans le profil recherché ; "basse" s'il est seulement souhaité, un plus, nice to have.
- exigences : phrases courtes reprenant les critères du profil (expérience, diplôme, langues, disponibilité), avec obligatoire=true si l'offre l'exige explicitement.
- conseils : 3 à 6 recommandations concrètes et spécifiques à cette offre pour adapter le CV (quoi mettre en avant, quel vocabulaire reprendre, quelle section renforcer). N'invente jamais d'expérience : propose de reformuler, réordonner, préciser.
- entreprise, lieu, type_contrat : chaîne vide si l'information est absente.
- resume : 2 à 3 phrases en français décrivant le poste et le profil attendu.
Réponds uniquement avec le JSON demandé.`;

/**
 * @returns {Promise<{analyse:object, dureeMs:number, modele:string|null}>}
 */
export async function analyzeOffer(texte, config) {
  const offre = String(texte || '').trim();
  if (offre.length < 80) throw httpError(400, "Le texte de l'offre est trop court pour être analysé (80 caractères minimum).");
  const { sortie, dureeMs, modele } = await runClaude({
    config, cwd: DATA, schema: SCHEMA, system: SYSTEM_PROMPT,
    prompt: `Offre d'emploi à analyser :\n\n${offre}\n`,
  });
  return { analyse: sanitize(sortie), dureeMs, modele };
}

function sanitize(a) {
  const str = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const seen = new Set();
  const mots = (Array.isArray(a.mots_cles) ? a.mots_cles : []).map((k) => ({
    terme: str(k.terme, 80),
    categorie: str(k.categorie, 40) || 'autre',
    importance: ['haute', 'moyenne', 'basse'].includes(k.importance) ? k.importance : 'moyenne',
    variantes: (Array.isArray(k.variantes) ? k.variantes : []).map((v) => str(v, 80)).filter(Boolean).slice(0, 8),
  })).filter((k) => {
    const key = k.terme.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 60);
  return {
    titre_poste: str(a.titre_poste, 150),
    entreprise: str(a.entreprise, 120),
    lieu: str(a.lieu, 120),
    type_contrat: str(a.type_contrat, 80),
    langue: a.langue === 'en' ? 'en' : 'fr',
    resume: str(a.resume, 1200),
    mots_cles: mots,
    exigences: (Array.isArray(a.exigences) ? a.exigences : []).map((e) => ({ texte: str(e.texte, 300), obligatoire: Boolean(e.obligatoire) })).filter((e) => e.texte).slice(0, 30),
    conseils: (Array.isArray(a.conseils) ? a.conseils : []).map((c) => str(c, 500)).filter(Boolean).slice(0, 10),
    analyseLe: new Date().toISOString(),
  };
}

