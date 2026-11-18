#!/bin/bash
# Lance CV Tailor : démarre le serveur local et ouvre le navigateur.
# Double-cliquer sur ce fichier dans le Finder. Fermer la fenêtre Terminal arrête l'outil.
cd "$(dirname "$0")" || exit 1

# Rendre node (nvm / homebrew) et claude (~/.local/bin) visibles même hors terminal interactif.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js introuvable. Installe Node 20+ (https://nodejs.org) puis relance."
  read -r -p "Appuie sur Entrée pour fermer."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "📦 Première installation des dépendances (télécharge Chromium ~170 Mo, une seule fois)…"
  npm install || { echo "❌ npm install a échoué."; read -r -p "Entrée pour fermer."; exit 1; }
fi

echo "🚀 Démarrage de CV Tailor…"
node server/index.js
