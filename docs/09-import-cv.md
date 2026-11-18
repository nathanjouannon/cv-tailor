# 09 — Import d'un CV existant (.docx + PDF)

Ajouté le 12 nov. 2026, après la v1. Depuis l'onglet **Modèles** → **Importer un CV**.

## Ce que ça fait

À partir de deux fichiers du **même** CV, CV Tailor crée seul :

1. un **modèle** (`data/modeles/<id>.json`) : le contenu, rangé dans le format de [04-format-cv-json.md](04-format-cv-json.md) ;
2. un **template** (`templates/<id>/`) : `template.html`, `style.css`, `meta.json`, qui reproduit le design du PDF.

Le modèle pointe sur le template créé. Les deux fichiers d'origine sont conservés dans `templates/_sources/<id>/` (`cv.docx`, `cv.pdf`) comme référence ; ce dossier est ignoré par git.

| Fichier | Sert à |
|---|---|
| `.docx` | Le texte (mammoth.js le convertit en texte brut avec titres, puces, liens) |
| `.pdf` | Le design : disposition, polices, couleurs, espacements. Sert aussi à compléter le texte quand le Word est incomplet (zones de texte, colonnes latérales). |

Un fichier `.pages` n'est pas accepté : dans Pages, *Fichier → Exporter vers* → **Word** puis **PDF**.

## Déroulé (1 à 5 minutes)

1. Lecture du `.docx` (local).
2. **Deux appels `claude -p` en parallèle**, avec l'outil `Read` limité à un dossier temporaire contenant `cv.pdf` :
   - *contenu* : texte Word + PDF → JSON du CV (`CV_SCHEMA`). Consigne : recopier sans reformuler, ne rien inventer, garder les titres de section d'origine et leur ordre ;
   - *design* : PDF → `{nom, description, accent, html, css}` (`TEMPLATE_SCHEMA`), avec la syntaxe du moteur de templates et le template `classique` en exemple.
3. Nettoyage du JSON et du template (`sanitizeTemplate` retire scripts, images, `@import`, `url()` distants, gestionnaires `on…=`) ; test de rendu avec le vrai contenu.
4. **Passe d'ajustement** : Puppeteer produit `rendu.png` ; un troisième appel Claude compare `rendu.png` au `cv.pdf` d'origine et renvoie un template corrigé. Il n'est retenu que s'il se rend sans erreur et n'occupe pas plus de pages. En cas d'échec, le premier jet est conservé (et signalé).
5. Écriture du template, des sources et du modèle.

L'avancement est suivi par l'interface : `POST /api/import-cv` (202, renvoie un `id`) puis `GET /api/import-cv/:id` toutes les 2 s (`en_cours`, `ok`, `erreur`). Les tâches sont en mémoire et expirent après 30 min.

## Confidentialité (levée de D4 pour cette fonction)

D4 disait que le CV n'est jamais envoyé à Claude. **Pour l'import uniquement**, le texte du CV et le PDF sont lus par Claude via ta commande `claude` (abonnement, pas de clé API). L'interface le dit dans la fenêtre d'import. Les autres fonctions (analyse d'offre, score, suggestions) ne lui envoient toujours que l'offre.

## Limites connues

- Pas d'image ni de photo : le moteur de templates n'a pas de champ photo, elles sont ignorées.
- Police : Arial est imposée à tous les modèles (exigence ATS), quelle que soit la police du PDF source.
- La fidélité est très bonne sur les designs à base de blocs, de colonnes et de couleurs, moins sur les éléments décoratifs (formes, icônes, dégradés).
- Les sections sans équivalent (ex. « Bénévolat ») sont rangées dans `projets`, `certifications` ou `interets` avec leur titre d'origine, et listées dans « À vérifier ».
- Relire toujours le modèle importé : l'extraction peut commettre des erreurs.
- Réglages : `analyseTimeoutMs` (au moins 300 s par appel est appliqué pour l'import), `claudeModel` et `claudeEffort` s'appliquent aussi à l'import.

## Fichiers

`server/lib/importer.js` (orchestration, prompts, schémas, nettoyage), `server/lib/claude.js` (appel CLI partagé avec l'analyse), `public/js/import.js` (fenêtre d'import), `server/lib/pdf.js` (`renderPng`, `pdfPageCount`).
