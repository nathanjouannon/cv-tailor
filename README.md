# CV Tailor

Outil local (macOS, Windows, Linux) pour adapter un CV à une offre d'emploi et passer les filtres ATS :
analyse de l'offre par Claude (via Claude Code et ton abonnement), éditeur de CV par sections
avec aperçu A4 en direct, score de mots-clés, export PDF en un clic, historique par candidature.

**Lancer :** double-clic sur `CVTailor.command` (macOS) ou `CVTailor.bat` (Windows), `./CVTailor.sh` (Linux), ou `npm start` partout, puis `http://127.0.0.1:3030`.

**Documentation complète :** [`docs/README.md`](docs/README.md) — vision, décisions, architecture,
format JSON du CV, templates, analyse IA, guide d'utilisation, roadmap.

```
CVTailor.command   lanceur double-clic macOS
CVTailor.bat       lanceur double-clic Windows
CVTailor.sh        lanceur Linux
server/           API Express + appel `claude` + export PDF (Puppeteer)
public/           interface HTML / CSS / JS (sans framework)
templates/        designs de CV en HTML/CSS (classique, moderne)
data/             modèles de CV (JSON), candidatures, exports PDF, config.json
docs/             documentation
```
