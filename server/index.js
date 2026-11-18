// Serveur local CV Tailor : API + fichiers statiques. Écoute uniquement sur 127.0.0.1.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { openPath } from './lib/os.js';
import * as store from './lib/store.js';
import { analyzeOffer, claudeStatus } from './lib/analyze.js';
import { startImport, getImport } from './lib/importer.js';
import { generateLetter } from './lib/letter.js';
import { checkSpelling } from './lib/spellcheck.js';
import { renderPdf, chromiumStatus, closeBrowser } from './lib/pdf.js';
import { fullDocument } from './lib/render.js';

const app = express();
app.use(express.json({ limit: '45mb' }));
app.use(express.static(path.join(store.ROOT, 'public'), { etag: true, lastModified: true, setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
app.use('/templates', express.static(store.DIRS.templates));

// Nom de fichier lisible : accents retirés, casse conservée, séparateurs → _
const fileSlug = (str) => String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'CV';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- Santé & config ----------
app.get('/api/sante', wrap(async (req, res) => {
  const config = await store.getConfig();
  res.json({ node: process.version, claude: claudeStatus(config), chromium: await chromiumStatus(), data: store.DATA });
}));
app.get('/api/config', wrap(async (req, res) => res.json(await store.getConfig())));
app.put('/api/config', wrap(async (req, res) => res.json(await store.saveConfig(req.body || {}))));

// ---------- Templates ----------
app.get('/api/templates', wrap(async (req, res) => res.json(await store.listTemplates())));
app.get('/api/templates/:id', wrap(async (req, res) => res.json(await store.getTemplate(req.params.id))));

// ---------- Modèles ----------
app.get('/api/modeles', wrap(async (req, res) => res.json(await store.listModeles())));
app.post('/api/modeles', wrap(async (req, res) => res.status(201).json(await store.createModele(req.body || {}))));
app.get('/api/modeles/:id', wrap(async (req, res) => res.json(await store.getModele(req.params.id))));
app.put('/api/modeles/:id', wrap(async (req, res) => res.json(await store.saveModele(req.params.id, req.body || {}))));
app.post('/api/modeles/:id/dupliquer', wrap(async (req, res) => res.status(201).json(await store.duplicateModele(req.params.id))));
app.delete('/api/modeles/:id', wrap(async (req, res) => { await store.deleteModele(req.params.id); res.json({ ok: true }); }));

// ---------- Analyse ----------
app.post('/api/analyse', wrap(async (req, res) => {
  const config = await store.getConfig();
  res.json(await analyzeOffer(req.body?.texte, config));
}));

// ---------- Import d'un CV existant (.docx + PDF → modèle + template) ----------
app.post('/api/import-cv', wrap(async (req, res) => {
  const config = await store.getConfig();
  if (!claudeStatus(config).trouve) { const e = new Error('Commande `claude` introuvable : l\'import en a besoin.'); e.status = 503; throw e; }
  res.status(202).json({ id: startImport(req.body || {}, config) });
}));
app.get('/api/import-cv/:id', wrap(async (req, res) => res.json(getImport(req.params.id))));

// ---------- Candidatures ----------
app.get('/api/candidatures', wrap(async (req, res) => res.json(await store.listCandidatures())));
app.post('/api/candidatures', wrap(async (req, res) => res.status(201).json(await store.createCandidature(req.body || {}))));
app.get('/api/candidatures/:id', wrap(async (req, res) => res.json(await store.getCandidature(req.params.id))));
app.put('/api/candidatures/:id', wrap(async (req, res) => res.json(await store.updateCandidature(req.params.id, req.body || {}))));
app.delete('/api/candidatures/:id', wrap(async (req, res) => { await store.deleteCandidature(req.params.id); res.json({ ok: true }); }));

// ---------- Lettre de motivation ----------
app.post('/api/candidatures/:id/lettre/generer', wrap(async (req, res) => {
  const config = await store.getConfig();
  if (!claudeStatus(config).trouve) { const e = new Error('Commande `claude` introuvable : la génération en a besoin.'); e.status = 503; throw e; }
  const cand = await store.getCandidature(req.params.id);
  const { lettre, dureeMs, modele } = await generateLetter({
    cv: cand.cv, analyse: cand.analyse, offre: cand.offre, existante: cand.lettre, options: req.body || {}, config,
  });
  await store.updateCandidature(req.params.id, { lettre, meta: { langueLettre: lettre.langue } });
  res.json({ lettre, dureeMs, modele });
}));

// ---------- Correcteur d'orthographe (avant export) ----------
app.post('/api/verifier-orthographe', wrap(async (req, res) => {
  const config = await store.getConfig();
  if (!claudeStatus(config).trouve) { const e = new Error('Commande `claude` introuvable : le correcteur en a besoin.'); e.status = 503; throw e; }
  const { type, cv, lettre } = req.body || {};
  res.json(await checkSpelling({ type: type === 'lettre' ? 'lettre' : 'cv', document: type === 'lettre' ? lettre : cv, config }));
}));

// ---------- Export PDF ----------
app.post('/api/export-pdf', wrap(async (req, res) => {
  const { html, css, lang, accent, nomFichier, candidatureId, type } = req.body || {};
  const isLettre = type === 'lettre';
  if (!html || !css) { const e = new Error('html et css requis'); e.status = 400; throw e; }
  const pdf = await renderPdf(fullDocument({ html, css, lang, accent, title: isLettre ? 'Lettre de motivation' : 'CV' }));
  const safeName = `${fileSlug(nomFichier || (isLettre ? 'Lettre' : 'CV'))}.pdf`;
  const exportPath = path.join(store.DIRS.exports, safeName);
  await fs.writeFile(exportPath, pdf);
  let dossier = null;
  if (candidatureId) {
    await fs.writeFile(store.candidaturePdfPath(candidatureId, isLettre ? 'lettre' : 'cv'), pdf);
    const meta = isLettre ? { lettrePdf: safeName, lettreExporteeLe: new Date().toISOString() } : { pdf: safeName, exporteLe: new Date().toISOString() };
    await store.updateCandidature(candidatureId, { meta });
    dossier = path.dirname(store.candidaturePdfPath(candidatureId));
  }
  res.json({ fichier: safeName, chemin: exportPath, dossier, taille: pdf.length });
}));
app.get('/api/exports/:fichier', wrap(async (req, res) => {
  const name = path.basename(req.params.fichier);
  if (!/^[A-Za-z0-9_.-]+\.pdf$/.test(name)) { const e = new Error('Nom de fichier invalide'); e.status = 400; throw e; }
  res.download(path.join(store.DIRS.exports, name));
}));

// ---------- Explorateur de fichiers (Finder / Explorateur / gestionnaire de fichiers) ----------
app.post('/api/ouvrir-dossier', wrap(async (req, res) => {
  const target = path.resolve(String(req.body?.chemin || store.DIRS.exports));
  if (target !== store.DATA && !target.startsWith(store.DATA + path.sep)) { const e = new Error('Chemin hors de data/'); e.status = 400; throw e; }
  openPath(target);
  res.json({ ok: true });
}));

// ---------- Erreurs ----------
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ erreur: err.message || 'Erreur serveur' });
});

// ---------- Démarrage ----------
const noOpen = process.argv.includes('--no-open');
await store.ensureDirs();
const config = await store.getConfig();
const port = Number(process.env.PORT || config.port || 3030);
const server = app.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`CV Tailor prêt : ${url}   (Ctrl+C ou fermer la fenêtre pour arrêter)`);
  if (config.ouvrirNavigateur && !noOpen) openPath(url);
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Le port ${port} est déjà utilisé. Change "port" dans data/config.json ou ferme l'autre instance.`);
  else console.error(e);
  process.exit(1);
});
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, async () => { await closeBrowser(); process.exit(0); });
