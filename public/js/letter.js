// Lettre de motivation : modèle de données, rendu HTML A4 et CSS. Partagé client/serveur (modules ES, aucune dépendance).
// Le rendu est indépendant des templates de CV : seule la couleur d'accent du template du CV est reprise.
import { escapeHtml } from './render.js';

export const LETTER_LANGS = { fr: 'Français', en: 'English' };
export const LETTER_TONES = {
  professionnel: 'Professionnel (neutre, soigné)',
  chaleureux: 'Chaleureux (humain, enthousiaste)',
  direct: 'Direct (concis, factuel)',
  formel: 'Formel (sobre, institutionnel)',
};

const MONTHS = {
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

export function formatLetterDate(lang, d = new Date()) {
  if (lang === 'en') return `${MONTHS.en[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return `${d.getDate() === 1 ? '1er' : d.getDate()} ${MONTHS.fr[d.getMonth()]} ${d.getFullYear()}`;
}

/** Ville probable à partir de l'adresse du CV (premier segment sans chiffre), sinon vide. */
function guessCity(adresse) {
  const first = String(adresse || '').split(',')[0].trim();
  return first && !/\d/.test(first) ? first : '';
}

const str = (v, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Complète / assainit une lettre (utilisé à la lecture, à l'écriture et avant le rendu). */
export function normalizeLetter(l) {
  const x = l && typeof l === 'object' ? l : {};
  return {
    langue: x.langue === 'en' ? 'en' : 'fr',
    ton: Object.hasOwn(LETTER_TONES, x.ton) ? x.ton : 'professionnel',
    consignes: str(x.consignes, 1500),
    lieu: str(x.lieu, 120),
    date: str(x.date, 60),
    expediteur: { nom: '', adresse: '', email: '', telephone: '', ...(x.expediteur && typeof x.expediteur === 'object' ? x.expediteur : {}) },
    destinataire: { nom: '', fonction: '', entreprise: '', adresse: '', ...(x.destinataire && typeof x.destinataire === 'object' ? x.destinataire : {}) },
    objet: str(x.objet, 300),
    salutation: str(x.salutation, 200),
    paragraphes: (Array.isArray(x.paragraphes) ? x.paragraphes : []).map((p) => str(p)),
    formule: str(x.formule, 400),
    signature: str(x.signature, 200),
    genereLe: x.genereLe || null,
    modele: x.modele || null,
  };
}

/** Lettre vide pré-remplie avec l'identité du CV, la date du jour et l'entreprise de l'offre. */
export function blankLetter(cv, analyse, langue) {
  const id = (cv && cv.identite) || {};
  const lang = langue === 'en' ? 'en' : 'fr';
  const nom = [id.prenom, id.nom].filter(Boolean).join(' ');
  return normalizeLetter({
    langue: lang,
    lieu: guessCity(id.adresse),
    date: formatLetterDate(lang),
    expediteur: { nom, adresse: id.adresse || '', email: id.email || '', telephone: id.telephone || '' },
    destinataire: { entreprise: (analyse && analyse.entreprise) || '' },
    signature: nom,
  });
}

export function letterText(l) {
  const x = normalizeLetter(l);
  return [x.objet, x.salutation, ...x.paragraphes, x.formule].filter(Boolean).join('\n\n');
}

const multiline = (s) => escapeHtml(s).replace(/\n/g, '<br>');
const lines = (arr) => arr.filter((s) => s && String(s).trim()).map((s) => multiline(String(s).trim())).join('<br>');

/** Fragment HTML de la lettre (une page A4). */
export function renderLetter(lettre) {
  const l = normalizeLetter(lettre);
  const en = l.langue === 'en';
  const from = l.expediteur;
  const to = l.destinataire;
  const contact = [from.email, from.telephone].filter(Boolean).join(' · ');
  const dateLine = [l.lieu, l.date].filter(Boolean).join(en ? ', ' : ', le ').replace(/^(.*), le $/, '$1');
  const fromBlock = [
    from.nom ? `<b>${escapeHtml(from.nom)}</b>` : '',
    from.adresse ? multiline(from.adresse) : '',
    contact ? escapeHtml(contact) : '',
  ].filter(Boolean).join('<br>');
  const toBlock = lines([to.nom, to.fonction, to.entreprise, to.adresse]);
  const objetLabel = en ? 'Subject:' : 'Objet :';
  const paras = l.paragraphes.filter((p) => p.trim()).map((p) => `<p class="l-p">${multiline(p.trim())}</p>`).join('');
  return `<article class="cv page lettre">
  <div class="l-top">
    <div class="l-from">${fromBlock}</div>
    <div class="l-to">${toBlock}</div>
  </div>
  ${dateLine ? `<p class="l-date">${escapeHtml(dateLine)}</p>` : ''}
  ${l.objet ? `<p class="l-objet"><b>${objetLabel}</b> ${multiline(l.objet)}</p>` : ''}
  ${l.salutation ? `<p class="l-salut">${multiline(l.salutation)}</p>` : ''}
  <div class="l-body">${paras}</div>
  ${l.formule ? `<p class="l-formule">${multiline(l.formule)}</p>` : ''}
  ${l.signature ? `<p class="l-signature">${multiline(l.signature)}</p>` : ''}
</article>`;
}

export const LETTER_CSS = `
@page { size: A4; margin: 0; }
:root { --accent: #1f2937; }
.cv.page.lettre {
  box-sizing: border-box; width: 210mm; min-height: 297mm; padding: 20mm 24mm 18mm;
  background: #fff; color: #111827;
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 10.5pt; line-height: 1.5;
}
.lettre .l-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12mm; margin-bottom: 12mm; }
.lettre .l-from { font-size: 9.5pt; color: #4b5563; line-height: 1.45; }
.lettre .l-from b { display: block; font-size: 13pt; color: var(--accent); margin-bottom: 1mm; letter-spacing: .3px; }
.lettre .l-to { text-align: right; line-height: 1.45; max-width: 75mm; }
.lettre .l-date { text-align: right; margin: 0 0 9mm; color: #4b5563; }
.lettre .l-objet { margin: 0 0 8mm; padding-bottom: 2mm; border-bottom: 1px solid var(--accent); }
.lettre .l-objet b { color: var(--accent); }
.lettre .l-salut { margin: 0 0 4mm; }
.lettre .l-p { margin: 0 0 3.6mm; text-align: justify; hyphens: auto; break-inside: avoid; }
.lettre .l-formule { margin: 5mm 0 10mm; break-inside: avoid; }
.lettre .l-signature { margin: 0; font-weight: 700; color: var(--accent); break-inside: avoid; }
`;
