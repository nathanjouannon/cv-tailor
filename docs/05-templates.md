# 05 — Templates HTML/CSS

Un template est un dossier dans `templates/` contenant :

```
templates/<id>/
├── meta.json        # { "id", "nom", "description", "accent" }
├── template.html    # fragment HTML avec balises {{ }}
└── style.css        # styles du CV, utilisés à l'identique dans l'aperçu et dans le PDF
```

Les deux templates livrés (`classique` et `moderne`) sont des points de départ en une colonne,
à ajuster pour reproduire les designs `.pages` de Nathan (voir « Reproduire un design existant »).

## Mini moteur de templates

Implémenté dans `public/js/render.js` (réutilisé côté serveur). Syntaxe volontairement réduite :

| Syntaxe | Effet |
|---|---|
| `{{identite.prenom}}` | Insère la valeur, échappée HTML. Chemin pointé. |
| `{{{resume}}}` | Insère sans échapper (réservé, à éviter). |
| `{{#each experiences}} … {{/each}}` | Répète le bloc pour chaque élément. Dans le bloc, `{{poste}}` lit l'élément courant, `{{this}}` l'élément lui-même (listes de textes), `{{@index}}` la position. |
| `{{#if lieu}} … {{/if}}` | Rend le bloc si la valeur est non vide (texte non vide, tableau non vide, nombre ≠ 0, `true`). |
| `{{#unless lieu}} … {{/unless}}` | Inverse de `if`. |
| `{{#section "experiences"}} … {{/section}}` | Rend le bloc seulement si la section est dans `sections` et non vide. |
| `{{titre "experiences"}}` | Titre de section : `titres.experiences` sinon le titre par défaut de la langue. |
| `{{../champ}}` | Remonte au contexte parent. |

Les blocs s'imbriquent librement. Toute résolution échouée donne une chaîne vide, jamais d'erreur.

## Contrat de mise en page

- La racine du template est `<article class="cv page">`.
- `style.css` doit définir `.page { width: 210mm; min-height: 297mm; }` et `@page { size: A4; margin: 0; }`.
  Les marges intérieures sont des `padding` sur `.page`, pas des marges `@page`, pour que l'aperçu et le PDF coïncident.
- Pas de ressource externe (polices web, images distantes) : le PDF est généré hors ligne.
- Police : toujours `Arial, Helvetica, sans-serif` (exigence ATS) ; ne pas utiliser d'autre police.
- Couleurs d'accent via la variable CSS `--accent`, initialisée depuis `meta.json`.
- Les classes `.kw` (mot-clé trouvé) sont ajoutées par l'aperçu uniquement ; le PDF n'en contient jamais.
  Le template ne doit pas les styler ; `app.css` s'en charge.

## Détection de débordement

L'aperçu rend le CV dans un conteneur de 297 mm de haut et compare `scrollHeight` à `clientHeight`.
Au-delà, un bandeau rouge indique le dépassement en millimètres. Le PDF, lui, aura deux pages :
c'est volontairement visible pour forcer la correction (décision D9).

## Reproduire un design existant (.pages)

Raccourci : **Modèles → Importer un CV** fait les étapes ci-dessous automatiquement à partir d'un `.docx` et d'un PDF ([09-import-cv.md](09-import-cv.md)). La procédure manuelle reste utile pour retoucher un template généré.

1. Dans Pages : Fichier → Exporter vers → PDF, et aussi → Word (`.docx`) pour récupérer le texte.
2. Déposer le PDF dans `templates/_sources/` (dossier ignoré par le rendu, utile comme référence).
3. Dupliquer `templates/classique/` sous un nouvel id, adapter `meta.json`.
4. Ajuster `style.css` : marges, polices, tailles, couleur d'accent, espacement des sections.
5. Si la structure diffère (ex. compétences avant expériences), modifier `sections` dans le modèle JSON
   plutôt que le template : l'ordre est piloté par les données.
6. Ouvrir un modèle avec ce template et comparer l'aperçu au PDF d'origine côte à côte.

## Ajouter un template

Créer le dossier avec les trois fichiers ; il apparaît au prochain chargement de la page dans le
sélecteur « Template » de la barre d'outils de l'éditeur. Aucun enregistrement ailleurs.
