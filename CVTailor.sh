#!/bin/bash
# Lance CV Tailor sous Linux (ou macOS en terminal) : démarre le serveur local et ouvre le navigateur.
# Usage : ./CVTailor.sh   (rendre exécutable une fois : chmod +x CVTailor.sh)
cd "$(dirname "$0")" || exit 1

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js introuvable. Installe Node 20+ (https://nodejs.org) puis relance."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "📦 Première installation des dépendances (télécharge Chromium ~170 Mo, une seule fois)…"
  npm install || { echo "❌ npm install a échoué."; exit 1; }
fi

echo "🚀 Démarrage de CV Tailor…"
node server/index.js
