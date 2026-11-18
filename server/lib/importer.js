// Import d'un CV existant : un .docx (contenu) + un PDF (design) → un modèle JSON + un template HTML/CSS.
// Claude lit le contenu du CV : c'est la seule fonction qui lui envoie des données personnelles (levée explicite de D4, voir docs/09-import-cv.md).
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import mammoth from 'mammoth';
import * as store from './store.js';
import { runClaude, httpError } from './claude.js';
import { render, fullDocument, DEFAULT_SECTIONS } from './render.js';
import { renderPdf, renderPng, pdfPageCount } from './pdf.js';

const MAX_FILE = 15 * 1024 * 1024;
const SECTION_IDS = [...DEFAULT_SECTIONS];
const str = { type: 'string' };
const strArr = { type: 'array', items: str };
const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

export const CV_SCHEMA = obj({
  langue: { type: 'string', enum: ['fr', 'en'] },
  identite: obj({
    prenom: str, nom: str, titre: str, email: str, telephone: str, adresse: str,
    liens: { type: 'array', items: obj({ label: str, url: str }) },
  }),
  resume: str,
  sections: { type: 'array', items: { type: 'string', enum: SECTION_IDS } },
  titres: obj(Object.fromEntries(['resume', ...SECTION_IDS].map((k) => [k, str]))),
  experiences: { type: 'array', items: obj({ poste: str, entreprise: str, lieu: str, debut: str, fin: str, description: str, points: strArr }) },
  formations: { type: 'array', items: obj({ diplome: str, etablissement: str, lieu: str, debut: str, fin: str, details: str }) },
  competences: { type: 'array', items: obj({ categorie: str, items: strArr }) },
  projets: { type: 'array', items: obj({ nom: str, description: str, lien: str, points: strArr }) },
  langues: { type: 'array', items: obj({ langue: str, niveau: str }) },
  certifications: { type: 'array', items: obj({ nom: str, organisme: str, date: str }) },
  interets: strArr,
  remarques: strArr,
});

export const TEMPLATE_SCHEMA = obj({ nom: str, description: str, accent: str, html: str, css: str });

const CONTENT_PROMPT = `Tu extrais le contenu d'un CV pour le ranger dans un format JSON fixe. Tu reçois le texte du fichier Word (parfois incomplet : les zones de texte, colonnes latérales et en-têtes peuvent manquer) et le même CV en PDF (fichier cv.pdf dans le dossier courant, à lire avec l'outil Read). Le PDF fait foi pour compléter ce qui manque dans le texte Word.

Règles :
- Recopie les textes tels quels : aucune reformulation, aucune traduction, aucune correction de style, aucun ajout. N'invente rien : un champ absent du CV reste une chaîne vide ou un tableau vide.
- Une puce du CV = un élément de "points", sans le symbole de puce. Un paragraphe d'introduction d'une expérience va dans "description".
- "sections" liste les sections présentes, dans l'ordre où elles apparaissent dans le CV (valeurs possibles : experiences, competences, formations, projets, langues, certifications, interets). Le résumé / profil / accroche va dans "resume" (il n'est pas dans "sections").
- "titres" donne, pour chaque section, le titre exactement tel qu'il est écrit dans le CV (casse et accents d'origine). Chaîne vide si la section n'existe pas.
- Une section qui n'a pas d'équivalent (ex. « Bénévolat », « Publications ») : range-la dans la section la plus proche (projets, certifications ou interets) en gardant son titre d'origine dans "titres", et mentionne-le dans "remarques".
- Compétences : une entrée par catégorie du CV. Si le CV liste les compétences sans catégorie, une seule entrée avec categorie "Compétences".
- Dates : telles qu'écrites (« 2023 », « sept. 2021 », « Présent »…). Découpe en debut / fin ; une date unique va dans debut.
- liens : label tel qu'affiché, url complète (ajoute https:// si besoin). Email et téléphone séparés de l'adresse.
- "langue" = langue principale du CV (fr ou en).
- "remarques" : phrases courtes en français signalant ce que tu n'as pas pu ranger fidèlement ou ce qui semble manquer (photo, section inclassable, texte illisible). Vide s'il n'y a rien à signaler.
Réponds uniquement avec le JSON demandé.`;

const SYNTAX = `Syntaxe du moteur de templates (volontairement réduite) :
- {{identite.prenom}} insère une valeur échappée (chemin pointé). Une valeur absente donne une chaîne vide.
- {{#each experiences}}…{{/each}} répète le bloc ; dans le bloc {{poste}} lit l'élément courant, {{this}} l'élément lui-même (liste de textes), {{@index}}, {{@first}}, {{@last}} ; {{../champ}} remonte au parent.
- {{#if champ}}…{{/if}} et {{#unless champ}}…{{/unless}} (non vide / vide).
- {{#section "experiences"}}…{{/section}} rend le bloc seulement si cette section existe et n'est pas vide. Sert à placer chaque section à un endroit précis (colonne latérale, bandeau…).
- {{titre "experiences"}} insère le titre de la section tel qu'il est dans le CV.
- {{#sections}}…{{#is "experiences"}}…{{/is}}…{{/sections}} parcourt les sections dans l'ordre du CV (utile pour une colonne unique).
Champs du CV : identite {prenom, nom, titre, email, telephone, adresse, liens[{label,url}]}, resume, experiences[{poste, entreprise, lieu, debut, fin, description, points[]}], formations[{diplome, etablissement, lieu, debut, fin, details}], competences[{categorie, items[]}], projets[{nom, description, lien, points[]}], langues[{langue, niveau}], certifications[{nom, organisme, date}], interets[].`;

const RULES = `Contraintes du template :
- La racine est <article class="cv page"> ... </article>. Toutes les règles CSS sont préfixées par .cv (ex. ".cv .item-title") pour ne pas affecter l'interface.
- Format A4 strict : .cv.page { box-sizing: border-box; width: 210mm; min-height: 297mm; } avec les marges intérieures en padding sur .page, et @page { size: A4; margin: 0; }. Le CV doit tenir sur UNE page.
- Aucune ressource externe : pas de <script>, <link>, <img>, @import, ni de police web. Police OBLIGATOIRE : font-family: Arial, Helvetica, sans-serif sur tout le CV (exigence ATS), quelle que soit la police du PDF.
- Les fonds de couleur, colonnes (flex ou grid), bandeaux, filets et puces sont autorisés ; les couleurs se reproduisent à l'identique (printBackground actif). Pas d'image ni de photo : ignore-les. Les icônes peuvent être remplacées par un caractère Unicode simple ou omises.
- Reproduis fidèlement : disposition (une ou plusieurs colonnes, largeurs), position et style de chaque bloc, polices (famille, graisse, taille en pt), couleurs (hex), interlignes, espacements, marges, filets, majuscules, alignements, forme des puces, présentation des dates (à droite, en colonne…).
- Définis la couleur principale dans la variable CSS --accent (:root { --accent: #xxxxxx; } en tête de style.css) et renvoie la même valeur dans "accent".
- Le HTML doit gérer les champs vides avec {{#if}} (pas de séparateur ni de libellé orphelin).`;

const DESIGN_SYSTEM = (exemple) => `Tu es un intégrateur HTML/CSS. Tu reçois un CV en PDF (fichier cv.pdf dans le dossier courant, à lire avec l'outil Read) et tu recrées son DESIGN sous forme de template HTML/CSS réutilisable avec d'autres contenus. Tu ne recopies pas le texte du CV : tu écris des balises {{ }} qui seront remplies par les données de n'importe quel CV.

${SYNTAX}

${RULES}

Exemple de template existant (une colonne, à titre d'exemple de syntaxe uniquement, ne copie pas son design) :
--- template.html ---
${exemple.html}
--- style.css ---
${exemple.css}
---

Réponds uniquement avec le JSON demandé : nom (court, ex. « Bandeau bleu »), description (une phrase), accent (hex), html (le fragment <article>), css (style.css complet).`;

const REFINE_SYSTEM = (exemple) => `Tu es un intégrateur HTML/CSS chargé d'ajuster un template de CV pour qu'il ressemble le plus possible à un PDF de référence. Tu reçois dans le dossier courant cv.pdf (le design cible, 1re page) et rendu.png (rendu actuel du template rempli avec le contenu). Lis les deux avec l'outil Read, compare-les point par point (disposition, largeurs de colonnes, polices et tailles, couleurs, interlignes, espacements, marges, filets, majuscules, alignements, puces, dates), puis renvoie le template corrigé en entier. Ne change pas ce qui est déjà fidèle. Corrige d'abord les écarts les plus visibles. Le CV doit tenir sur une page A4.

${SYNTAX}

${RULES}

Réponds uniquement avec le JSON demandé : nom, description, accent, html, css.`;

// ---------- Fichiers ----------
function decode(b64, label, magic) {
  if (typeof b64 !== 'string' || !b64) throw httpError(400, `Fichier ${label} manquant.`);
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) throw httpError(400, `Fichier ${label} vide.`);
  if (buf.length > MAX_FILE) throw httpError(400, `Fichier ${label} trop volumineux (15 Mo maximum).`);
  if (buf.subarray(0, magic.length).toString('latin1') !== magic) throw httpError(400, `Le fichier ${label} n'est pas un vrai ${label} (format non reconnu).`);
  return buf;
}

const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/** .docx → texte brut avec puces, titres et liens (lisible par Claude). */
export async function docxToText(buffer) {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const text = html
    .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, (m, href, label) => (label.replace(/<[^>]+>/g, '') === href ? label : `${label} (${href})`))
    .replace(/<h[1-6][^>]*>/gi, '\n## ')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|h[1-6]|tr|ul|ol|table)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '  |  ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => entities[m])
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 50) throw httpError(422, 'Le .docx ne contient presque pas de texte lisible. Vérifie que c\'est bien le bon fichier.');
  return text;
}

// ---------- Nettoyage ----------
function cleanStr(v, max = 1500) { return typeof v === 'string' ? v.replace(/\s+\n/g, '\n').trim().slice(0, max) : ''; }
const cleanList = (v, max = 400) => (Array.isArray(v) ? v.map((x) => cleanStr(x, max)).filter(Boolean) : []);

export function cleanCv(raw) {
  const c = raw || {};
  const id = c.identite || {};
  const titres = {};
  for (const k of ['resume', ...SECTION_IDS]) { const t = cleanStr(c.titres?.[k], 80); if (t) titres[k] = t; }
  const cv = {
    langue: c.langue === 'en' ? 'en' : 'fr',
    identite: {
      prenom: cleanStr(id.prenom, 80), nom: cleanStr(id.nom, 80), titre: cleanStr(id.titre, 150),
      email: cleanStr(id.email, 120), telephone: cleanStr(id.telephone, 40), adresse: cleanStr(id.adresse, 150),
      liens: (Array.isArray(id.liens) ? id.liens : []).map((l) => ({ label: cleanStr(l.label, 120), url: cleanStr(l.url, 300) })).filter((l) => l.label || l.url),
    },
    resume: cleanStr(c.resume, 2000),
    sections: [...new Set((Array.isArray(c.sections) ? c.sections : []).filter((s) => SECTION_IDS.includes(s)))],
    titres,
    experiences: (c.experiences || []).map((e) => ({
      poste: cleanStr(e.poste, 150), entreprise: cleanStr(e.entreprise, 150), lieu: cleanStr(e.lieu, 100),
      debut: cleanStr(e.debut, 40), fin: cleanStr(e.fin, 40), description: cleanStr(e.description, 600), points: cleanList(e.points),
    })).filter((e) => e.poste || e.entreprise),
    formations: (c.formations || []).map((f) => ({
      diplome: cleanStr(f.diplome, 200), etablissement: cleanStr(f.etablissement, 150), lieu: cleanStr(f.lieu, 100),
      debut: cleanStr(f.debut, 40), fin: cleanStr(f.fin, 40), details: cleanStr(f.details, 600),
    })).filter((f) => f.diplome || f.etablissement),
    competences: (c.competences || []).map((k) => ({ categorie: cleanStr(k.categorie, 100), items: cleanList(k.items, 100) })).filter((k) => k.items.length),
    projets: (c.projets || []).map((p) => ({ nom: cleanStr(p.nom, 150), description: cleanStr(p.description, 600), lien: cleanStr(p.lien, 200), points: cleanList(p.points) })).filter((p) => p.nom),
    langues: (c.langues || []).map((l) => ({ langue: cleanStr(l.langue, 60), niveau: cleanStr(l.niveau, 80) })).filter((l) => l.langue),
    certifications: (c.certifications || []).map((x) => ({ nom: cleanStr(x.nom, 200), organisme: cleanStr(x.organisme, 120), date: cleanStr(x.date, 40) })).filter((x) => x.nom),
    interets: cleanList(c.interets, 120),
  };
  // Une section présente dans le CV mais oubliée dans "sections" est ajoutée à la fin ; une section vide est retirée.
  for (const s of SECTION_IDS) if (cv[s].length && !cv.sections.includes(s)) cv.sections.push(s);
  cv.sections = cv.sections.filter((s) => cv[s].length);
  return { cv, remarques: cleanList(c.remarques, 300) };
}

/** Retire tout ce qui pourrait exécuter du code ou charger une ressource distante. */
export function sanitizeTemplate({ html, css }) {
  let h = String(html || '').trim()
    .replace(/<(script|iframe|object|embed|style|svg|video|audio|form)\b[\s\S]*?(<\/\1>|$)/gi, '')
    .replace(/<(link|meta|base|img|source|input|button)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*"javascript:[^"]*"/gi, '');
  if (!/^<article\b[^>]*class="[^"]*\bcv\b[^"]*\bpage\b/i.test(h)) {
    h = `<article class="cv page">\n${h.replace(/^<\/?article[^>]*>|<\/article>\s*$/gi, '')}\n</article>`;
  }
  let c = String(css || '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*['"]?(?!data:image\/(png|jpeg|svg\+xml);)[^)]*\)/gi, 'none')
    .replace(/<\/?style[^>]*>/gi, '');
  c += '\n@page { size: A4; margin: 0; }\n.cv.page { box-sizing: border-box; width: 210mm; min-height: 297mm; }\n';
  return { html: h, css: c };
}

function checkAccent(a) { return /^#[0-9a-fA-F]{3,8}$/.test(String(a || '').trim()) ? a.trim() : '#1f2937'; }

/** Rend le template avec le CV et renvoie le nombre de pages, ou l'erreur de syntaxe. */
async function trialRender(tpl, cv, accent) {
  let html;
  try { html = render(tpl.html, cv); } catch (e) { return { erreur: e.message }; }
  const doc = fullDocument({ html, css: tpl.css, lang: cv.langue, accent });
  const pdf = await renderPdf(doc);
  return { pages: await pdfPageCount(pdf), doc };
}

// ---------- Orchestration ----------
async function readExample() {
  const dir = path.join(store.DIRS.templates, 'classique');
  const [html, css] = await Promise.all([fs.readFile(path.join(dir, 'template.html'), 'utf8'), fs.readFile(path.join(dir, 'style.css'), 'utf8')]);
  return { html, css };
}

async function uniqueDir(base, id) {
  let cur = id; let i = 2;
  while (store.exists(path.join(base, cur))) { cur = `${id}-${i}`; i += 1; }
  return cur;
}

/**
 * @param {{docx:string, pdf:string, nom?:string}} payload  fichiers en base64
 * @param {object} config
 * @param {(etape:string)=>void} onStep
 */
export async function importCv(payload, config, onStep = () => {}) {
  const docx = decode(payload.docx, 'DOCX', 'PK');
  const pdf = decode(payload.pdf, 'PDF', '%PDF');
  const timeoutMs = Math.max(config.analyseTimeoutMs || 0, 300000);
  const t0 = Date.now();
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-tailor-import-'));
  try {
    await fs.writeFile(path.join(work, 'cv.pdf'), pdf);
    onStep('Lecture du fichier Word');
    const texte = await docxToText(docx);
    const exemple = await readExample();

    onStep('Claude lit le contenu et le design du CV');
    const [contenu, design] = await Promise.all([
      runClaude({
        config, cwd: work, tools: 'Read', timeoutMs, schema: CV_SCHEMA, system: CONTENT_PROMPT,
        prompt: `Texte extrait du fichier Word :\n\n${texte}\n\nLe PDF du même CV est dans cv.pdf.`,
      }),
      runClaude({
        config, cwd: work, tools: 'Read', timeoutMs, schema: TEMPLATE_SCHEMA, system: DESIGN_SYSTEM(exemple),
        prompt: 'Lis cv.pdf et crée le template HTML/CSS qui reproduit son design.',
      }),
    ]);
    const { cv, remarques } = cleanCv(contenu.sortie);
    if (!cv.identite.nom && !cv.experiences.length && !cv.formations.length) throw httpError(422, "Claude n'a trouvé aucun contenu exploitable dans ce CV.");

    onStep('Création du template');
    let tpl = sanitizeTemplate(design.sortie);
    let meta = { nom: cleanStr(design.sortie.nom, 60), description: cleanStr(design.sortie.description, 200), accent: checkAccent(design.sortie.accent) };
    let essai = await trialRender(tpl, cv, meta.accent);
    if (essai.erreur) throw httpError(502, `Le template généré est invalide : ${essai.erreur}`);

    onStep('Comparaison avec le PDF et ajustements');
    try {
      await fs.writeFile(path.join(work, 'rendu.png'), await renderPng(essai.doc));
      const raffine = await runClaude({
        config, cwd: work, tools: 'Read', timeoutMs, schema: TEMPLATE_SCHEMA, system: REFINE_SYSTEM(exemple),
        prompt: `Le rendu actuel (rendu.png) occupe ${essai.pages} page(s) A4 ; la cible est cv.pdf, sur une seule page.\n\nTemplate actuel :\n--- template.html ---\n${tpl.html}\n--- style.css ---\n${tpl.css}\n`,
      });
      const tpl2 = sanitizeTemplate(raffine.sortie);
      const accent2 = checkAccent(raffine.sortie.accent);
      const essai2 = await trialRender(tpl2, cv, accent2);
      if (!essai2.erreur && essai2.pages <= Math.max(1, essai.pages)) {
        tpl = tpl2; essai = essai2;
        meta = { nom: cleanStr(raffine.sortie.nom, 60) || meta.nom, description: cleanStr(raffine.sortie.description, 200) || meta.description, accent: accent2 };
      }
    } catch (e) {
      remarques.push(`L'ajustement visuel automatique a échoué (${e.message.slice(0, 120)}) : le premier jet du design est conservé.`);
    }
    if (essai.pages > 1) remarques.push(`Avec ce contenu, le CV occupe ${essai.pages} pages dans le template recréé. Ajuste les marges ou la taille de police dans templates/…/style.css, ou raccourcis le texte.`);

    onStep('Enregistrement');
    const nom = cleanStr(payload.nom, 80) || `${cv.identite.prenom} ${cv.identite.nom}`.trim() || 'CV importé';
    const tplId = await uniqueDir(store.DIRS.templates, store.slugify(meta.nom || nom, 'cv-importe'));
    const dir = path.join(store.DIRS.templates, tplId);
    const srcDir = path.join(store.DIRS.templates, '_sources', tplId);
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(srcDir, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(dir, 'template.html'), tpl.html, 'utf8'),
      fs.writeFile(path.join(dir, 'style.css'), tpl.css, 'utf8'),
      store.writeJson(path.join(dir, 'meta.json'), {
        nom: meta.nom || nom, description: meta.description || `Design importé depuis « ${nom} ».`, accent: meta.accent, ordre: 50, importeLe: new Date().toISOString(),
      }),
      fs.writeFile(path.join(srcDir, 'cv.pdf'), pdf),
      fs.writeFile(path.join(srcDir, 'cv.docx'), docx),
    ]);
    const modele = await store.createModele({ ...cv, nom, template: tplId });
    return {
      modele: { id: modele.id, nom: modele.nom }, template: { id: tplId, nom: meta.nom || nom },
      remarques, pages: essai.pages, dureeMs: Date.now() - t0,
    };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

// ---------- Tâches en arrière-plan (l'import dure 1 à 5 minutes) ----------
const jobs = new Map();

export function startImport(payload, config) {
  const id = crypto.randomUUID();
  const job = { id, etat: 'en_cours', etape: 'Démarrage', debut: Date.now() };
  jobs.set(id, job);
  importCv(payload, config, (etape) => { job.etape = etape; })
    .then((resultat) => { job.etat = 'ok'; job.resultat = resultat; })
    .catch((e) => { job.etat = 'erreur'; job.erreur = e.message || 'Erreur inconnue'; if (!e.status || e.status >= 500) console.error(e); })
    .finally(() => { job.fin = Date.now(); setTimeout(() => jobs.delete(id), 30 * 60 * 1000).unref(); });
  return id;
}

export function getImport(id) {
  const job = jobs.get(id);
  if (!job) throw httpError(404, 'Import introuvable ou expiré.');
  return { etat: job.etat, etape: job.etape, resultat: job.resultat, erreur: job.erreur, ecouleMs: (job.fin || Date.now()) - job.debut };
}
