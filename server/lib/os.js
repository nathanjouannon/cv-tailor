// Spécificités par système d'exploitation (macOS, Windows, Linux).
import { spawn } from 'node:child_process';

/** Ouvre un dossier, un fichier ou une URL avec l'application par défaut du système. */
export function openPath(target) {
  let cmd; let args;
  if (process.platform === 'darwin') { cmd = 'open'; args = [target]; }
  else if (process.platform === 'win32') { cmd = 'cmd'; args = ['/c', 'start', '""', `"${target}"`]; }
  else { cmd = 'xdg-open'; args = [target]; }
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' });
    child.on('error', () => { /* pas d'opener disponible : on ignore */ });
    child.unref();
  } catch { /* noop */ }
}
