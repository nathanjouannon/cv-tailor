# 03 — Architecture

## Stack

- **Serveur** : Node.js ≥ 20, Express 4, Puppeteer 24 (Chromium pour le PDF), `child_process` pour `claude`.
- **Client** : une page HTML, CSS vanille (variables, grid), JavaScript vanille en modules ES. Aucun build.
- **Données** : fichiers JSON et texte dans `data/`. Aucune base de données.

## Arborescence

```
cv-tailor/
├── CVTailor.command          # lanceur double-clic (macOS)
├── CVTailor.bat              # lanceur double-clic (Windows)
├── CVTailor.sh               # lanceur (Linux)
├── package.json
├── server/
│   ├── index.js             # Express : routes API + fichiers statiques + ouverture du navigateur
│   └── lib/
│       ├── analyze.js       # appel `claude -p` et validation de la réponse
│       ├── pdf.js           # rendu PDF via Puppeteer
│       ├── store.js         # lecture/écriture de data/ (modèles, candidatures, config)
│       └── render.js        # ré-export du moteur de templates partagé (public/js/render.js)
├── public/
│   ├── index.html
│   ├── css/app.css
│   └── js/
│       ├── app.js           # état global, mise en page gauche/droite, orchestration
│       ├── api.js           # fetch vers /api
│       ├── render.js        # mini moteur de templates (partagé avec le serveur)
│       ├── match.js         # normalisation du texte, détection des mots-clés, score ATS
│       ├── analysis.js      # panneau gauche : offre, résultats d'analyse
│       ├── library.js       # panneau gauche : modèles et candidatures
│       ├── editor.js        # panneau droit : formulaire par sections
│       └── preview.js       # panneau droit : aperçu A4, surlignage, débordement
├── templates/
│   ├── _sources/   # exports PDF des CV .pages d'origine (référence visuelle, ignoré par l'outil)
│   ├── classique/  (template.html, style.css, meta.json)
│   └── moderne/    (template.html, style.css, meta.json)
├── data/
│   ├── config.json          # port, modèle Claude, options
│   ├── modeles/             # un JSON par modèle de CV
│   ├── candidatures/        # un dossier par candidature
│   └── exports/             # PDF exportés (copie)
└── docs/
```

## Flux principal

```
[Offre collée] --POST /api/analyse--> [server/lib/analyze.js] --spawn--> claude -p --json-schema
                                                                               |
[Analyse JSON] <-------------------------------------------------------------- +
      |
      v
[Choix d'un modèle] --POST /api/candidatures--> dossier data/candidatures/<id>/ (offre.txt, analyse.json, cv.json, meta.json)
      |
      v
[Éditeur formulaire] --(chaque frappe)--> render.js --> aperçu A4 --> match.js --> score + surlignage
      |                                                           
      +--(800 ms)--> PUT /api/candidatures/<id>  (auto-save cv.json)
      |
      v
[Exporter PDF] --POST /api/export-pdf {html, css}--> Puppeteer --> <id>/cv.pdf + data/exports/<nom>.pdf
```

## Modes de l'interface

| État | Gauche | Droite |
|---|---|---|
| Aucun document ouvert | Pleine largeur : onglets Offre / Analyse / Modèles / Candidatures | Masquée |
| Modèle ouvert | Colonne ~380 px, repliable | Éditeur + aperçu, barre d'outils « Modèle » |
| Candidature ouverte | Colonne ~380 px, repliable, onglet Analyse actif | Éditeur + aperçu, score ATS, bouton Exporter PDF |

La largeur de la colonne gauche se règle en tirant la poignée centrale.

## API HTTP (toutes les réponses en JSON sauf téléchargements)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/config` | Configuration courante |
| PUT | `/api/config` | Met à jour `claudeModel`, `claudeEffort`, `exportDir` |
| GET | `/api/templates` | Liste des templates (meta) |
| GET | `/api/templates/:id` | `{ meta, html, css }` |
| GET | `/api/modeles` | Liste des modèles de CV |
| POST | `/api/modeles` | Crée ou importe un modèle (corps = CV JSON) |
| GET | `/api/modeles/:id` | Un modèle |
| PUT | `/api/modeles/:id` | Remplace un modèle |
| POST | `/api/modeles/:id/dupliquer` | Copie un modèle |
| DELETE | `/api/modeles/:id` | Supprime un modèle |
| POST | `/api/analyse` | `{ texte }` → analyse structurée (voir 06) |
| POST | `/api/import-cv` | `{ docx, pdf, nom? }` (fichiers en base64) → 202 `{ id }` ; crée un modèle + un template (voir 09) |
| GET | `/api/import-cv/:id` | État de l'import : `en_cours`, `ok` (`resultat`) ou `erreur` |
| GET | `/api/candidatures` | Liste (meta) triée par date |
| POST | `/api/candidatures` | `{ modeleId, offre, analyse }` → crée le dossier et copie le CV |
| GET | `/api/candidatures/:id` | `{ meta, offre, analyse, cv }` |
| PUT | `/api/candidatures/:id` | Met à jour `cv`, `meta` (statut, notes) ou `analyse` |
| DELETE | `/api/candidatures/:id` | Supprime le dossier |
| POST | `/api/export-pdf` | `{ html, css, nomFichier, candidatureId? }` → `{ fichier, chemin }` |
| GET | `/api/exports/:fichier` | Télécharge un PDF |
| POST | `/api/ouvrir-dossier` | `{ chemin }` → ouvre le dossier dans l'explorateur de fichiers du système (`server/lib/os.js`) |
| GET | `/api/sante` | État : version node, `claude` trouvé, Chromium présent |

## Sécurité et confidentialité

- Le serveur n'écoute que sur `127.0.0.1`.
- Le seul flux sortant est le texte de l'offre envoyé à Claude via la CLI, avec les droits du compte Nathan.
- Le contenu du CV n'est jamais envoyé à Claude dans la v1 (décision D4).
- Les identifiants de fichiers sont dérivés de slugs ; toute route refuse les chemins contenant `..`.
