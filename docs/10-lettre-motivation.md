# 10 — Lettre de motivation

Chaque candidature peut avoir une lettre de motivation, générée par Claude à partir du CV de la candidature,
de l'analyse et du texte de l'offre, dans la langue choisie, puis entièrement modifiable comme le CV.

## Utilisation

1. Ouvre une candidature : un bouton **CV | Lettre** apparaît dans la barre du panneau droit.
2. Onglet **Lettre**, section *Génération* : choisis la **langue** (FR / EN), le **ton** (professionnel, chaleureux, direct, formel) et,
   si besoin, des **consignes** libres (« insister sur… », « ne pas parler de… »), puis **✦ Générer avec Claude** (1 à 2 minutes).
3. Modifie le texte dans les sections *Contenu*, *Destinataire*, *Expéditeur et date*. L'aperçu A4 se met à jour à chaque frappe
   et la lettre est enregistrée automatiquement (comme le CV).
4. **⬇ Exporter PDF** (⌘E) exporte la vue affichée : en vue Lettre, c'est la lettre (`Lettre_Prenom_NOM_Entreprise.pdf`,
   ou `CoverLetter_…` si elle est en anglais).

**Régénérer** remplace objet, salutation, paragraphes et formule (une confirmation est demandée). Expéditeur, lieu, date, adresse et signature
déjà édités sont conservés.

## Confidentialité

Contrairement à l'analyse d'offre, la génération envoie à Claude (via ta commande `claude`) le **contenu du CV** de la candidature,
en plus de l'analyse et de l'offre. Un rappel est affiché dans le panneau. Voir la décision D4 dans [02-decisions.md](02-decisions.md).

## Données

`data/candidatures/<id>/lettre.json` (+ `lettre.pdf` après export). Champs : `langue`, `ton`, `consignes`, `lieu`, `date`,
`expediteur{nom,adresse,email,telephone}`, `destinataire{nom,fonction,entreprise,adresse}`, `objet`, `salutation`,
`paragraphes[]`, `formule`, `signature`, `genereLe`, `modele`. L'expéditeur est prérempli depuis l'identité du CV.

## Code

| Fichier | Rôle |
|---|---|
| `public/js/letter.js` | modèle de données, rendu HTML, CSS A4 (partagé client / serveur) |
| `public/js/letter-editor.js` | formulaire d'édition + bouton de génération |
| `server/lib/letter.js` | prompt, schéma JSON, appel `claude -p` via `runClaude` |
| `POST /api/candidatures/:id/lettre/generer` | génère et enregistre la lettre (`{langue, ton, consignes}`) |
| `POST /api/export-pdf` | accepte `type: "lettre"` : écrit `lettre.pdf` et `meta.lettrePdf` |

Le design de la lettre est unique (sobre, sans-serif) ; elle reprend seulement la couleur d'accent du template du CV.
Prompt : n'invente aucun fait absent du CV, 3 à 4 paragraphes (200–320 mots), mots-clés de l'analyse repris naturellement.
