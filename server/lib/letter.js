// Génération d'une lettre de motivation via la CLI Claude Code (abonnement claude.ai). Voir docs/10-lettre-motivation.md.
import { DATA } from './store.js';
import { runClaude, httpError } from './claude.js';
import { LETTER_LANGS, LETTER_TONES, blankLetter, normalizeLetter } from '../../public/js/letter.js';

export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['objet', 'destinataire_nom', 'destinataire_fonction', 'salutation', 'paragraphes', 'formule'],
  properties: {
    objet: { type: 'string' },
    destinataire_nom: { type: 'string' },
    destinataire_fonction: { type: 'string' },
    salutation: { type: 'string' },
    paragraphes: { type: 'array', items: { type: 'string' } },
    formule: { type: 'string' },
  },
};

export const SYSTEM_PROMPT = `Tu es un expert du recrutement et de la rédaction de lettres de motivation. On te donne le CV d'un candidat (JSON), l'analyse d'une offre d'emploi, le texte de l'offre, une langue de rédaction, un ton et éventuellement des consignes du candidat. Tu rédiges la lettre de motivation de ce candidat pour cette offre.

Règles :
- Rédige la lettre ENTIÈREMENT dans la langue demandée (objet, salutation, paragraphes, formule de politesse), quelle que soit la langue du CV ou de l'offre.
- N'invente JAMAIS de fait : expériences, employeurs, diplômes, outils, chiffres, dates, projets. Appuie-toi uniquement sur le CV. Si l'offre demande quelque chose que le CV ne montre pas, ne le prétends pas : mets en avant les compétences voisines réellement présentes.
- Pas de placeholder ni de crochets ("[Nom]", "[...]"). Si une information manque (nom du recruteur, adresse), laisse le champ vide ou utilise la formule générique.
- Structure en 3 ou 4 paragraphes (200 à 320 mots au total) : 1) accroche précise sur le poste et l'entreprise, pourquoi cette offre ; 2) deux ou trois réalisations ou expériences du CV les plus pertinentes face aux exigences, avec des faits concrets ; 3) ce que le candidat apporte à l'entreprise, en reprenant naturellement les mots-clés importants de l'analyse (sans bourrage) ; 4) ouverture vers un entretien, brève et sans formule creuse.
- Ne recopie pas le CV : complète-le, relie les expériences aux besoins de l'offre. Évite les clichés ("dynamique et motivé", "je me permets de").
- objet : court et factuel, mentionne le poste (et la référence si l'offre en donne une).
- destinataire_nom / destinataire_fonction : uniquement si l'offre nomme un contact ou un service (sinon chaîne vide).
- salutation : "Madame, Monsieur," / "Dear Hiring Manager," ou adaptée au contact nommé, selon la langue. formule : une phrase de politesse conforme à la langue et au ton, sans signature.
- paragraphes : un élément du tableau par paragraphe, texte brut sans markdown, sans salutation ni formule de politesse dedans.
- Applique le ton demandé et respecte les consignes du candidat tant qu'elles ne t'obligent pas à inventer.
Réponds uniquement avec le JSON demandé.`;

/**
 * @param {object} p
 * @param {object} p.cv         CV de la candidature
 * @param {object} p.analyse    analyse de l'offre (peut être null)
 * @param {string} p.offre      texte de l'offre (peut être vide)
 * @param {object} p.existante  lettre actuelle (ses champs hors texte généré sont conservés)
 * @param {{langue?:string, ton?:string, consignes?:string}} p.options
 * @returns {Promise<{lettre:object, dureeMs:number, modele:string|null}>}
 */
export async function generateLetter({ cv, analyse, offre, existante, options = {}, config }) {
  if (!cv) throw httpError(400, 'Cette candidature n\'a pas de CV.');
  if (!analyse && !String(offre || '').trim()) throw httpError(400, "Il faut l'analyse ou le texte de l'offre pour écrire la lettre.");
  const langue = Object.hasOwn(LETTER_LANGS, options.langue) ? options.langue : (analyse?.langue || cv.langue || 'fr');
  const ton = Object.hasOwn(LETTER_TONES, options.ton) ? options.ton : 'professionnel';
  const consignes = String(options.consignes || '').trim().slice(0, 1500);

  const cvPourClaude = { ...cv };
  for (const k of ['template', 'sections', 'titres', 'id']) delete cvPourClaude[k];
  const analysePourClaude = analyse && {
    titre_poste: analyse.titre_poste, entreprise: analyse.entreprise, lieu: analyse.lieu, type_contrat: analyse.type_contrat,
    resume: analyse.resume, exigences: analyse.exigences,
    mots_cles: (analyse.mots_cles || []).map((k) => ({ terme: k.terme, importance: k.importance })),
  };
  const prompt = [
    `Langue de la lettre : ${LETTER_LANGS[langue]} (${langue})`,
    `Ton : ${LETTER_TONES[ton]}`,
    consignes ? `Consignes du candidat : ${consignes}` : '',
    `\nCV du candidat (JSON) :\n${JSON.stringify(cvPourClaude)}`,
    analysePourClaude ? `\nAnalyse de l'offre (JSON) :\n${JSON.stringify(analysePourClaude)}` : '',
    offre ? `\nTexte de l'offre :\n${String(offre).slice(0, 12000)}` : '',
  ].filter(Boolean).join('\n');

  const { sortie, dureeMs, modele } = await runClaude({ config, cwd: DATA, schema: SCHEMA, system: SYSTEM_PROMPT, prompt });
  const paragraphes = (Array.isArray(sortie.paragraphes) ? sortie.paragraphes : []).map((p) => String(p).trim()).filter(Boolean);
  if (!paragraphes.length) throw httpError(502, 'Claude n\'a renvoyé aucun paragraphe. Réessaie.');

  // Le contenu écrit par Claude remplace l'ancien ; expéditeur, lieu, adresse du destinataire… édités à la main sont conservés.
  const base = existante ? normalizeLetter(existante) : blankLetter(cv, analyse, langue);
  const neuve = blankLetter(cv, analyse, langue);
  const memeLangue = base.langue === langue;
  const lettre = normalizeLetter({
    ...base,
    langue, ton, consignes,
    date: memeLangue && base.date ? base.date : neuve.date,
    expediteur: { ...neuve.expediteur, ...Object.fromEntries(Object.entries(base.expediteur).filter(([, v]) => v)) },
    destinataire: {
      ...base.destinataire,
      nom: String(sortie.destinataire_nom || '').trim() || base.destinataire.nom,
      fonction: String(sortie.destinataire_fonction || '').trim() || base.destinataire.fonction,
      entreprise: base.destinataire.entreprise || neuve.destinataire.entreprise,
    },
    objet: String(sortie.objet || '').trim(),
    salutation: String(sortie.salutation || '').trim(),
    paragraphes,
    formule: String(sortie.formule || '').trim(),
    signature: base.signature || neuve.signature,
    genereLe: new Date().toISOString(),
    modele,
  });
  return { lettre, dureeMs, modele };
}
