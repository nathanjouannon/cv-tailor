// Import d'un CV existant : .docx (contenu) + PDF (design) → modèle + template créés côté serveur.
import { state, $, $$, el, toast } from './state.js';
import { api } from './api.js';
import { openModele } from './doc.js';
import { refreshLists, refreshTemplates } from './library.js';

const files = { docx: null, pdf: null };
let timer = null;
let running = false;

const toBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(new Error(`Lecture impossible : ${file.name}`));
  r.readAsDataURL(file);
});

export function initImport() {
  const dlg = $('#dlg-import');
  $('#btn-cv-importer').addEventListener('click', () => { reset(); dlg.showModal(); });
  $('#import-annuler').addEventListener('click', () => {
    if (running && !confirm("L'import est en cours. Fermer la fenêtre ne l'interrompt pas, mais tu ne verras pas le résultat. Fermer quand même ?")) return;
    dlg.close();
  });
  dlg.addEventListener('cancel', (e) => { if (running) e.preventDefault(); });
  $('#form-import').addEventListener('submit', (e) => { e.preventDefault(); lancer(); });

  for (const zone of $$('.dropzone', dlg)) {
    const input = $('input', zone);
    input.addEventListener('change', () => { assign([...input.files]); input.value = ''; });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); assign([...e.dataTransfer.files]); });
  }
}

function reset() {
  files.docx = null; files.pdf = null; running = false;
  clearInterval(timer);
  $('#import-nom').value = '';
  $('#import-saisie').hidden = false;
  $('#import-progress').hidden = true;
  $('#import-erreur').hidden = true;
  $('#import-resultat').hidden = true;
  $('#import-resultat').innerHTML = '';
  $('#import-annuler').textContent = 'Annuler';
  $('#import-lancer').hidden = false;
  paint();
}

// Les fichiers sont rangés d'après leur extension, quelle que soit la zone où ils sont déposés.
function assign(list) {
  for (const f of list) {
    if (/\.docx$/i.test(f.name)) files.docx = f;
    else if (/\.pdf$/i.test(f.name)) files.pdf = f;
    else if (/\.pages$/i.test(f.name)) toast('Format .pages non pris en charge : exporte-le d\'abord en Word et en PDF depuis Pages (Fichier → Exporter vers).', { type: 'error', duration: 8000 });
    else toast(`${f.name} : seuls les fichiers .docx et .pdf sont acceptés.`, { type: 'error' });
  }
  paint();
}

function paint() {
  for (const kind of ['docx', 'pdf']) {
    const zone = $(`.dropzone[data-kind="${kind}"]`);
    const f = files[kind];
    zone.classList.toggle('ok', Boolean(f));
    $('.dz-name', zone).textContent = f ? `✓ ${f.name}` : (kind === 'docx' ? 'Glisser un .docx ici ou cliquer' : 'Glisser un PDF ici ou cliquer');
  }
  $('#import-lancer').disabled = !(files.docx && files.pdf) || running;
  if (files.docx && !$('#import-nom').value) $('#import-nom').placeholder = files.docx.name.replace(/\.docx$/i, '');
}

async function lancer() {
  if (running || !files.docx || !files.pdf) return;
  running = true;
  $('#import-erreur').hidden = true;
  $('#import-saisie').hidden = true;
  $('#import-progress').hidden = false;
  $('#import-etape').textContent = 'Envoi des fichiers…';
  $('#import-lancer').disabled = true;
  const debut = Date.now();
  const chrono = () => { const s = Math.round((Date.now() - debut) / 1000); $('#import-chrono').textContent = s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`; };
  chrono();
  try {
    const nom = $('#import-nom').value.trim();
    const { id } = await api.importCv({ docx: await toBase64(files.docx), pdf: await toBase64(files.pdf), nom });
    await new Promise((resolve, reject) => {
      timer = setInterval(async () => {
        chrono();
        try {
          const etat = await api.importCvEtat(id);
          $('#import-etape').textContent = `${etat.etape}…`;
          if (etat.etat === 'ok') { clearInterval(timer); resolve(afficherResultat(etat.resultat)); }
          if (etat.etat === 'erreur') { clearInterval(timer); reject(new Error(etat.erreur)); }
        } catch (e) { clearInterval(timer); reject(e); }
      }, 2000);
    });
  } catch (e) {
    running = false;
    $('#import-progress').hidden = true;
    $('#import-saisie').hidden = false;
    const box = $('#import-erreur');
    box.textContent = e.message;
    box.hidden = false;
    paint();
  }
}

async function afficherResultat(r) {
  running = false;
  $('#import-progress').hidden = true;
  $('#import-lancer').hidden = true;
  $('#import-annuler').textContent = 'Fermer';
  const box = $('#import-resultat');
  box.innerHTML = '';
  box.append(...[
    el('div', { class: 'alert info' }, `Modèle « ${r.modele.nom} » et template « ${r.template.nom} » créés en ${Math.round(r.dureeMs / 1000)} s. Relis le contenu : l'extraction peut contenir des erreurs.`),
    r.remarques.length ? el('div', { class: 'alert error' }, 'À vérifier :', el('ul', {}, ...r.remarques.map((t) => el('li', {}, t)))) : null,
    el('div', { class: 'row end', style: 'margin-top:12px' }, el('button', { type: 'button', class: 'btn primary', onClick: async () => {
      $('#dlg-import').close();
      try { await openModele(r.modele.id); } catch (e) { toast(e.message, { type: 'error' }); }
    } }, 'Ouvrir le modèle')),
  ].filter(Boolean));
  box.hidden = false;
  await refreshTemplates();
  await refreshLists();
  toast('CV importé', { type: 'success' });
}
