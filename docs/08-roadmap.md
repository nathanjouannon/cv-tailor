# 08 — Roadmap et idées écartées

Rien de ce qui suit n'est dans la v1. Ordre indicatif d'intérêt.

## Court terme

- **Réécriture assistée par section** (écartée en D4) : bouton « Proposer une reformulation » sur une puce,
  qui envoie la puce + les mots-clés manquants à Claude et affiche la proposition à accepter/refuser.
  Le CV serait alors transmis à Claude : à décider explicitement.
- ~~**Import `.docx`**~~ : fait le 12 nov. 2026, avec le PDF pour le design, voir [09-import-cv.md](09-import-cv.md).
- **Templates deux colonnes / photo** : le moteur le permet déjà ; il manque des templates.
- ~~**Lettre de motivation**~~ : fait le 13 nov. 2026, voir [10-lettre-motivation.md](10-lettre-motivation.md).

## Moyen terme

- Comparaison avant/après du score d'une candidature.
- Détection des mots-clés présents dans le CV mais absents de l'offre (bruit à retirer pour gagner de la place).
- Historique des versions d'un CV dans une candidature (`cv.v1.json`, `cv.v2.json`).
- Export `.docx` du CV (certains ATS le préfèrent au PDF) via la bibliothèque `docx`.
- Réglage de l'échelle de police globale pour faire tenir sur une page.

## Écarté pour de bon (sauf changement de contexte)

- Récupération de l'offre par URL : les sites bloquent (D10).
- Application Electron : le `.command` suffit (D8).
- Multi-utilisateur, cloud, authentification : hors sujet pour un outil personnel.
- Clé API Anthropic : possible en remplaçant `analyze.js` par un appel SDK `@anthropic-ai/sdk`
  (modèle `claude-opus-5-5`, `output_config.format` pour le JSON) si l'abonnement ne convient plus.
