// Appel de la CLI Claude Code en mode non interactif (abonnement claude.ai, pas de clé API).
// Partagé par l'analyse d'offre (analyze.js) et l'import de CV (importer.js).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

const IS_WIN = process.platform === 'win32';
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

export function resolveClaude(configPath) {
  if (configPath && isFile(configPath)) return configPath;
  const names = IS_WIN ? ['claude.exe', 'claude.cmd', 'claude'] : ['claude'];
  const dirs = [
    path.join(os.homedir(), '.local', 'bin'),
    path.join(os.homedir(), '.claude', 'local'),
    ...(IS_WIN
      ? [path.join(process.env.APPDATA || '', 'npm'), path.join(process.env.LOCALAPPDATA || '', 'Programs', 'claude')]
      : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']),
    ...(process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean),
  ];
  for (const d of dirs) for (const n of names) { const p = path.join(d, n); if (isFile(p)) return p; }
  return null;
}

/** Commande + arguments de lancement : sous Windows, un shim npm (.cmd) est remplacé par `node cli.js`. */
function launchSpec(bin, args) {
  if (IS_WIN && /\.(cmd|bat)$/i.test(bin)) {
    const cli = path.join(path.dirname(bin), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    if (isFile(cli)) return { cmd: process.execPath, args: [cli, ...args] };
  }
  return { cmd: bin, args };
}

export function claudeStatus(config) {
  const bin = resolveClaude(config.claudePath);
  return { trouve: Boolean(bin), chemin: bin };
}

/**
 * Lance `claude -p` et renvoie la sortie structurée.
 * @param {object} o
 * @param {object} o.config      config CV Tailor (claudePath, claudeModel, claudeEffort)
 * @param {string} o.prompt      message utilisateur (envoyé sur stdin)
 * @param {string} o.system      prompt système
 * @param {object} o.schema      JSON Schema de la sortie
 * @param {string} o.cwd         dossier de travail de claude
 * @param {string} [o.tools]     outils autorisés ('' = aucun, 'Read' = lecture de fichiers dans cwd)
 * @param {number} [o.timeoutMs]
 * @returns {Promise<{sortie:object, dureeMs:number, modele:string|null}>}
 */
export function runClaude({ config, prompt, system, schema, cwd, tools = '', timeoutMs }) {
  return new Promise((resolve, reject) => {
    const bin = resolveClaude(config.claudePath);
    if (!bin) return reject(httpError(503, "Commande `claude` introuvable. Installe Claude Code ou renseigne claudePath dans data/config.json."));

    const args = ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--system-prompt', system, '--tools', tools, '--no-session-persistence'];
    if (tools) args.push('--allowedTools', tools);
    if (config.claudeModel) args.push('--model', config.claudeModel);
    if (config.claudeEffort) args.push('--effort', config.claudeEffort);

    const delai = timeoutMs || config.analyseTimeoutMs || 180000;
    const started = Date.now();
    const env = { ...process.env };
    delete env.CLAUDECODE; // autorise le lancement depuis une session Claude Code
    const spec = launchSpec(bin, args);
    const child = spawn(spec.cmd, spec.args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = ''; let err = '';
    const timer = setTimeout(() => { child.kill(); reject(httpError(504, `Claude interrompu après ${Math.round(delai / 1000)} s.`)); }, delai);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(httpError(500, `Impossible de lancer claude : ${e.message}`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      let json;
      try { json = JSON.parse(out); } catch {
        return reject(httpError(502, `Réponse de claude illisible (code ${code}). ${(err || out).slice(0, 600)}`));
      }
      if (json.is_error || json.subtype !== 'success') {
        const msg = typeof json.result === 'string' ? json.result : JSON.stringify(json).slice(0, 600);
        return reject(httpError(502, `Claude a renvoyé une erreur : ${msg}`));
      }
      let sortie = json.structured_output;
      if (!sortie && typeof json.result === 'string') { try { sortie = JSON.parse(json.result); } catch { /* noop */ } }
      if (!sortie || typeof sortie !== 'object') return reject(httpError(502, 'Sortie structurée absente de la réponse de claude.'));
      const modele = json.modelUsage ? Object.keys(json.modelUsage).filter((m) => json.modelUsage[m].outputTokens > 0)[0] || null : null;
      resolve({ sortie, dureeMs: Date.now() - started, modele });
    });
    child.stdin.end(prompt);
  });
}
