# 07 — Guide d'utilisation

## Installation (une fois)

1. Prérequis : Node.js ≥ 20, Claude Code installé et connecté (`claude` dans un terminal, puis `/login` si besoin).
2. Lancer le lanceur de son système : `CVTailor.command` (macOS, double-clic), `CVTailor.bat` (Windows, double-clic) ou `./CVTailor.sh` (Linux). La première fois, `npm install` télécharge Express, Puppeteer et Chromium (~170 Mo). Compter 1 à 3 minutes.
3. Le navigateur s'ouvre sur `http://127.0.0.1:3030`. Si macOS bloque le `.command` : clic droit → Ouvrir, ou `chmod +x CVTailor.command`. Sous Windows, si SmartScreen avertit : « Informations complémentaires » → « Exécuter quand même ».

Alternative terminal : `npm start` à la racine. Pour arrêter : fermer la fenêtre du terminal ou `Ctrl+C`.

**Linux :** Arial n'est pas installé par défaut ; installer `fonts-liberation` (ou `ttf-mscorefonts-installer`) pour que le PDF rende la police Arial (exigence ATS), et `xdg-utils` pour l'ouverture automatique du navigateur/dossier. Chromium peut aussi nécessiter des bibliothèques système (`libnss3`, `libgbm1`…).

## Préparer ses modèles de CV

**Méthode rapide (recommandée) : importer un CV existant.** Onglet **Modèles** → **Importer un CV** : dépose le `.docx` et le PDF du même CV (depuis Pages : *Fichier → Exporter vers* → Word et PDF). Après 1 à 5 minutes, le modèle et un template fidèle au design sont créés, et le modèle s'ouvre. Relis le contenu et les points « À vérifier ». Détails et limites : [09-import-cv.md](09-import-cv.md).

**Méthode manuelle :**

1. Dans Pages, exporter chaque CV en PDF (référence visuelle) et en Word (texte).
2. Dans CV Tailor, onglet **Modèles** → **Nouveau modèle**, ou **Importer** un JSON existant (format : [04-format-cv-json.md](04-format-cv-json.md)).
3. Ouvrir le modèle, remplir les sections dans le formulaire de droite en copiant le texte depuis le `.docx`.
   L'aperçu se met à jour en direct. Choisir le template dans la barre d'outils.
4. Le modèle s'enregistre automatiquement (800 ms après la dernière frappe, indicateur « Enregistré » dans la barre d'outils).

Dans l'éditeur : un clic sur l'en-tête d'une section la replie ou la déplie ; le crayon ✎ renomme le titre tel qu'il apparaît dans le CV ; les flèches réordonnent ; l'œil masque une section sans perdre son contenu. Chaque élément (expérience, formation…) a ses propres flèches, un bouton dupliquer et un bouton supprimer.

## Adapter un CV à une offre

1. Onglet **Offre** : coller le texte complet de l'offre (titre, missions, profil recherché). Cliquer **Analyser**.
   L'analyse prend 15 à 60 s. Le résultat s'affiche dans l'onglet **Analyse** : poste, entreprise, langue, mots-clés par importance, exigences, conseils.
2. Cliquer **Créer une candidature**, choisir le modèle de départ : la liste affiche le score ATS de chaque modèle face à l'offre pour choisir le meilleur point de départ. Un dossier est créé dans `data/candidatures/`
   et l'éditeur s'ouvre à droite.
3. Dans l'onglet **Analyse**, les mots-clés passent en vert (présents) ou rouge (manquants) selon le contenu du CV.
   Le score ATS en haut de l'éditeur se met à jour à chaque frappe. Cliquer un mot-clé le copie dans le presse-papiers.
4. Modifier le CV : reformuler les puces avec le vocabulaire exact de l'offre, compléter la section Compétences,
   ajuster le titre et l'accroche. Ne jamais ajouter une compétence non maîtrisée.
5. Surveiller le bandeau de débordement : le CV doit tenir sur une page A4.
6. **Exporter PDF** : le fichier est écrit dans le dossier de la candidature et copié dans `data/exports/`
   sous la forme `CV_<Prenom>_<Nom>_<Entreprise>.pdf`. Un bouton ouvre le dossier dans l'explorateur de fichiers.

## Nouvelle analyse sur une candidature ouverte

Si tu relances une analyse alors qu'une candidature est ouverte, le résultat s'affiche avec deux actions : **Créer une candidature** (nouveau dossier) ou **Appliquer à la candidature ouverte** (remplace l'offre et l'analyse du dossier courant).

## Retrouver une candidature

Onglet **Candidatures** : liste par date avec entreprise, poste, score, statut. Ouvrir, modifier,
re-exporter, changer le statut (brouillon, envoyée, entretien, refus, acceptée) ou supprimer.

## Raccourcis

| Raccourci | Action |
|---|---|
| `Cmd+S` | Enregistrer maintenant |
| `Cmd+E` | Exporter PDF |
| `Cmd+\` | Replier / déplier le panneau gauche |
| `Échap` | Fermer le document ouvert |

## Fichiers produits

```
data/candidatures/2026-11-12_acme_developpeur-full-stack/
├── meta.json      # titre, entreprise, dates, statut, score, modèle d'origine, template
├── offre.txt      # texte collé
├── analyse.json   # sortie de Claude
├── cv.json        # CV adapté
└── cv.pdf         # dernier export
```

Tout est copiable, sauvegardable (Time Machine, git) et lisible sans l'outil.
