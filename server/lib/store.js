// Accès au dossier data/ : config, modèles de CV, candidatures, templates.
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeLetter } from '../../public/js/letter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');
export const DATA = path.join(ROOT, 'data');
export const DIRS = {
  modeles: path.join(DATA, 'modeles'),
  candidatures: path.join(DATA, 'candidatures'),
  exports: path.join(DATA, 'exports'),
  templates: path.join(ROOT, 'templates'),
};

export const DEFAULT_CONFIG = {
  port: 3030,
  verifierAvantExport: false, // propose le correcteur avant chaque export PDF
  ouvrirNavigateur: true,
  claudeModel: '',        // vide = modèle par défaut de Claude Code ; sinon "sonnet", "opus", id complet…
  claudeEffort: '',       // vide = défaut ; sinon low | medium | high
  claudePath: '',         // vide = recherche dans le PATH
  analyseTimeoutMs: 180000,
};

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,120}$/;
export function assertId(id) {
  if (typeof id !== 'string' || !SAFE_ID.test(id)) {
    const err = new Error(`Identifiant invalide : ${String(id).slice(0, 40)}`);
    err.status = 400;
    throw err;
  }
  return id;
}

export function slugify(str, fallback = 'sans-nom') {
  const s = String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || fallback;
}

export async function ensureDirs() {
  for (const d of Object.values(DIRS)) await fs.mkdir(d, { recursive: true });
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) {
    if (e.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw e;
  }
}
async function writeJson(file, data) {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}
const exists = (p) => fssync.existsSync(p);

// ---------- Config ----------
const CONFIG_FILE = path.join(DATA, 'config.json');
export async function getConfig() {
  const saved = await readJson(CONFIG_FILE, {});
  return { ...DEFAULT_CONFIG, ...saved };
}
export async function saveConfig(patch) {
  const allowed = ['port', 'ouvrirNavigateur', 'claudeModel', 'claudeEffort', 'claudePath', 'analyseTimeoutMs', 'verifierAvantExport'];
  const current = await readJson(CONFIG_FILE, {});
  for (const k of allowed) if (k in patch) current[k] = patch[k];
  await writeJson(CONFIG_FILE, current);
  return getConfig();
}

// ---------- Templates ----------
export async function listTemplates() {
  const out = [];
  for (const d of await fs.readdir(DIRS.templates, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith('_') || d.name.startsWith('.')) continue;
    const meta = await readJson(path.join(DIRS.templates, d.name, 'meta.json'), null);
    if (meta) out.push({ ...meta, id: d.name });
  }
  return out.sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99) || a.nom.localeCompare(b.nom));
}
export async function getTemplate(id) {
  assertId(id);
  const dir = path.join(DIRS.templates, id);
  if (!exists(dir)) { const e = new Error(`Template inconnu : ${id}`); e.status = 404; throw e; }
  const [meta, html, css] = await Promise.all([
    readJson(path.join(dir, 'meta.json'), { nom: id }),
    fs.readFile(path.join(dir, 'template.html'), 'utf8'),
    fs.readFile(path.join(dir, 'style.css'), 'utf8'),
  ]);
  return { meta: { ...meta, id }, html, css };
}

// ---------- Modèles de CV ----------
export function normalizeCv(cv) {
  const c = { ...cv };
  c.langue = c.langue === 'en' ? 'en' : 'fr';
  c.template = typeof c.template === 'string' && c.template ? c.template : 'classique';
  c.identite = { prenom: '', nom: '', titre: '', email: '', telephone: '', adresse: '', liens: [], ...(c.identite || {}) };
  if (!Array.isArray(c.identite.liens)) c.identite.liens = [];
  c.resume = typeof c.resume === 'string' ? c.resume : '';
  for (const k of ['experiences', 'formations', 'competences', 'projets', 'langues', 'certifications', 'interets']) {
    if (!Array.isArray(c[k])) c[k] = [];
  }
  if (!Array.isArray(c.sections)) delete c.sections;
  if (c.titres && typeof c.titres !== 'object') delete c.titres;
  c.nom = String(c.nom || `${c.identite.prenom} ${c.identite.nom}`.trim() || 'Modèle sans nom');
  return c;
}

export async function listModeles() {
  const out = [];
  for (const f of await fs.readdir(DIRS.modeles)) {
    if (!f.endsWith('.json')) continue;
    const cv = await readJson(path.join(DIRS.modeles, f), null);
    if (!cv) continue;
    const st = await fs.stat(path.join(DIRS.modeles, f));
    out.push({
      id: f.replace(/\.json$/, ''), nom: cv.nom, langue: cv.langue, template: cv.template,
      titre: cv.identite?.titre || '', modifie: st.mtime.toISOString(),
    });
  }
  return out.sort((a, b) => a.nom.localeCompare(b.nom));
}
export async function getModele(id) {
  assertId(id);
  const cv = await readJson(path.join(DIRS.modeles, `${id}.json`), null);
  if (!cv) { const e = new Error(`Modèle inconnu : ${id}`); e.status = 404; throw e; }
  return { ...normalizeCv(cv), id };
}
async function uniqueId(dir, base, ext = '') {
  let id = base; let i = 2;
  while (exists(path.join(dir, id + ext))) { id = `${base}-${i}`; i += 1; }
  return id;
}
export async function createModele(cv) {
  const c = normalizeCv(cv);
  const id = await uniqueId(DIRS.modeles, slugify(c.id || c.nom), '.json');
  c.id = id;
  await writeJson(path.join(DIRS.modeles, `${id}.json`), c);
  return c;
}
export async function saveModele(id, cv) {
  assertId(id);
  const c = { ...normalizeCv(cv), id };
  await writeJson(path.join(DIRS.modeles, `${id}.json`), c);
  return c;
}
export async function deleteModele(id) {
  assertId(id);
  await fs.rm(path.join(DIRS.modeles, `${id}.json`), { force: true });
}
export async function duplicateModele(id) {
  const src = await getModele(id);
  return createModele({ ...src, id: `${id}-copie`, nom: `${src.nom} (copie)` });
}

// ---------- Candidatures ----------
const candDir = (id) => path.join(DIRS.candidatures, assertId(id));

export async function listCandidatures() {
  const out = [];
  for (const d of await fs.readdir(DIRS.candidatures, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const meta = await readJson(path.join(DIRS.candidatures, d.name, 'meta.json'), null);
    if (meta) out.push({ ...meta, id: d.name });
  }
  return out.sort((a, b) => String(b.creeLe).localeCompare(String(a.creeLe)));
}
export async function getCandidature(id) {
  const dir = candDir(id);
  if (!exists(dir)) { const e = new Error(`Candidature inconnue : ${id}`); e.status = 404; throw e; }
  const [meta, analyse, cv, offre, lettre] = await Promise.all([
    readJson(path.join(dir, 'meta.json'), {}),
    readJson(path.join(dir, 'analyse.json'), null),
    readJson(path.join(dir, 'cv.json'), null),
    fs.readFile(path.join(dir, 'offre.txt'), 'utf8').catch(() => ''),
    readJson(path.join(dir, 'lettre.json'), null),
  ]);
  return { id, meta: { ...meta, id }, analyse, cv: cv ? normalizeCv(cv) : null, offre, lettre: lettre ? normalizeLetter(lettre) : null, dossier: dir };
}
export async function createCandidature({ modeleId, offre, analyse }) {
  const modele = await getModele(modeleId);
  const date = new Date();
  const entreprise = analyse?.entreprise || 'entreprise';
  const poste = analyse?.titre_poste || 'poste';
  const base = `${date.toISOString().slice(0, 10)}_${slugify(entreprise)}_${slugify(poste)}`.slice(0, 120);
  const id = await uniqueId(DIRS.candidatures, base);
  const dir = path.join(DIRS.candidatures, id);
  await fs.mkdir(dir, { recursive: true });
  const meta = {
    id, entreprise, poste, langue: analyse?.langue || modele.langue, modeleId, template: modele.template,
    statut: 'brouillon', score: null, creeLe: date.toISOString(), modifieLe: date.toISOString(), pdf: null, notes: '',
  };
  const cv = { ...modele, id: undefined, nom: `${modele.nom} → ${entreprise}` };
  delete cv.id;
  await Promise.all([
    writeJson(path.join(dir, 'meta.json'), meta),
    writeJson(path.join(dir, 'analyse.json'), analyse || null),
    writeJson(path.join(dir, 'cv.json'), cv),
    fs.writeFile(path.join(dir, 'offre.txt'), offre || '', 'utf8'),
  ]);
  return getCandidature(id);
}
export async function updateCandidature(id, patch) {
  const dir = candDir(id);
  const current = await getCandidature(id);
  const meta = { ...current.meta, ...(patch.meta || {}), id, modifieLe: new Date().toISOString() };
  if (patch.cv) { meta.template = patch.cv.template || meta.template; await writeJson(path.join(dir, 'cv.json'), normalizeCv(patch.cv)); }
  if (patch.analyse !== undefined) await writeJson(path.join(dir, 'analyse.json'), patch.analyse);
  if (patch.lettre !== undefined) {
    if (patch.lettre === null) await fs.rm(path.join(dir, 'lettre.json'), { force: true });
    else await writeJson(path.join(dir, 'lettre.json'), normalizeLetter(patch.lettre));
  }
  if (typeof patch.offre === 'string') await fs.writeFile(path.join(dir, 'offre.txt'), patch.offre, 'utf8');
  await writeJson(path.join(dir, 'meta.json'), meta);
  return getCandidature(id);
}
export async function deleteCandidature(id) {
  await fs.rm(candDir(id), { recursive: true, force: true });
}
export function candidaturePdfPath(id, kind = 'cv') { return path.join(candDir(id), kind === 'lettre' ? 'lettre.pdf' : 'cv.pdf'); }
export { writeJson, readJson, exists };
