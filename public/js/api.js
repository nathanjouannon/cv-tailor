// Client HTTP vers le serveur local.
async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { erreur: text }; }
  if (!res.ok) throw new Error((data && data.erreur) || `${res.status} ${res.statusText}`);
  return data;
}

export const api = {
  sante: () => call('GET', '/api/sante'),
  getConfig: () => call('GET', '/api/config'),
  saveConfig: (patch) => call('PUT', '/api/config', patch),
  templates: () => call('GET', '/api/templates'),
  template: (id) => call('GET', `/api/templates/${encodeURIComponent(id)}`),
  modeles: () => call('GET', '/api/modeles'),
  modele: (id) => call('GET', `/api/modeles/${encodeURIComponent(id)}`),
  createModele: (cv) => call('POST', '/api/modeles', cv),
  saveModele: (id, cv) => call('PUT', `/api/modeles/${encodeURIComponent(id)}`, cv),
  duplicateModele: (id) => call('POST', `/api/modeles/${encodeURIComponent(id)}/dupliquer`),
  deleteModele: (id) => call('DELETE', `/api/modeles/${encodeURIComponent(id)}`),
  importCv: (payload) => call('POST', '/api/import-cv', payload),
  importCvEtat: (id) => call('GET', `/api/import-cv/${encodeURIComponent(id)}`),
  analyse: (texte) => call('POST', '/api/analyse', { texte }),
  candidatures: () => call('GET', '/api/candidatures'),
  candidature: (id) => call('GET', `/api/candidatures/${encodeURIComponent(id)}`),
  createCandidature: (payload) => call('POST', '/api/candidatures', payload),
  updateCandidature: (id, patch) => call('PUT', `/api/candidatures/${encodeURIComponent(id)}`, patch),
  deleteCandidature: (id) => call('DELETE', `/api/candidatures/${encodeURIComponent(id)}`),
  genererLettre: (id, options) => call('POST', `/api/candidatures/${encodeURIComponent(id)}/lettre/generer`, options),
  verifierOrthographe: (payload) => call('POST', '/api/verifier-orthographe', payload),
  exportPdf: (payload) => call('POST', '/api/export-pdf', payload),
  ouvrirDossier: (chemin) => call('POST', '/api/ouvrir-dossier', { chemin }),
};
