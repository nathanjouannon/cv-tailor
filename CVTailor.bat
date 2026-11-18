@echo off
chcp 65001 >nul
rem Lance CV Tailor sous Windows : demarre le serveur local et ouvre le navigateur.
rem Double-cliquer sur ce fichier. Fermer la fenetre arrete l outil.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js introuvable. Installe Node 20+ depuis https://nodejs.org puis relance.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Premiere installation des dependances ^(telecharge Chromium ~170 Mo, une seule fois^)...
  call npm install
  if errorlevel 1 (
    echo npm install a echoue.
    pause
    exit /b 1
  )
)

echo Demarrage de CV Tailor...
node server\index.js
pause
