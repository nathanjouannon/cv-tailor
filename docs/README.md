# CV Tailor — Documentation

Outil local (macOS, Windows, Linux) pour adapter un CV à une offre d'emploi et passer les filtres ATS.

| Document | Contenu |
|---|---|
| [01-vision-et-perimetre.md](01-vision-et-perimetre.md) | Objectif, cas d'usage, ce qui est inclus / exclu |
| [02-decisions.md](02-decisions.md) | Toutes les décisions prises avec Nathan le 12 nov. 2026 et leur justification |
| [03-architecture.md](03-architecture.md) | Stack, arborescence, flux de données, API HTTP |
| [04-format-cv-json.md](04-format-cv-json.md) | Schéma du fichier CV (`data/modeles/*.json`) |
| [05-templates.md](05-templates.md) | Comment fonctionnent les templates HTML/CSS et comment en ajouter un |
| [06-analyse-ia.md](06-analyse-ia.md) | Appel à Claude Code, prompt, schéma de sortie, calcul du score ATS |
| [07-utilisation.md](07-utilisation.md) | Guide pas à pas : lancer, analyser, adapter, exporter |
| [08-roadmap.md](08-roadmap.md) | Idées non retenues pour la v1 et évolutions possibles |
| [09-import-cv.md](09-import-cv.md) | Import d'un CV existant (.docx + PDF) : modèle et template créés automatiquement |
| [10-lettre-motivation.md](10-lettre-motivation.md) | Lettre de motivation générée par Claude (langue au choix) et modifiable |
| [11-correcteur.md](11-correcteur.md) | Correcteur d'orthographe (Claude) à lancer avant l'export |

Point d'entrée rapide : double-cliquer sur `CVTailor.command` (macOS) ou `CVTailor.bat` (Windows), ou lancer `./CVTailor.sh` (Linux), à la racine du projet.
