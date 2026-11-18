# 11 — Correcteur d'orthographe

Bouton **✓ Orthographe** dans la barre d'outils du document : relit le CV (ou la lettre, selon la vue affichée)
avec Claude et propose les corrections faute par faute, avant l'export PDF.

## Fonctionnement

1. `server/lib/spellcheck.js` aplatit le document en champs numérotés (résumé, titre, puces, compétences,
   titres de sections… ; la lettre : objet, salutation, paragraphes, formule). Les identifiants, e-mails,
   téléphone, liens, dates et noms d'entreprises/établissements ne sont pas envoyés.
2. Claude (`runClaude`, sans outils, comme l'analyse) renvoie des corrections ciblées :
   `{ champ, fautif, correction, categorie, explication }`. Il ne reformule jamais le style.
3. Le serveur rejette toute correction dont le fragment `fautif` n'existe pas dans le champ.
4. Le client (`public/js/spellcheck.js`) affiche chaque faute en contexte (ancien → nouveau) avec
   **Corriger** / **Ignorer**, ou **Tout corriger**. Une correction modifie le CV, l'éditeur, l'aperçu et déclenche l'enregistrement.

## Avant l'export

- Depuis le dialogue : bouton **Exporter le PDF** une fois la revue faite.
- Réglages → « Lancer le correcteur d'orthographe avant chaque export PDF » (`verifierAvantExport` dans
  `data/config.json`, désactivé par défaut) : l'export ouvre d'abord le correcteur ; s'il ne trouve rien, l'export continue seul.

## API

`POST /api/verifier-orthographe` — corps `{ type: 'cv', cv }` ou `{ type: 'lettre', lettre }` →
`{ problemes: [{ chemin, label, texte, fautif, correction, categorie, explication }], nbChamps, dureeMs, modele }`.

## Limites

Nécessite la commande `claude` (comme l'analyse) ; compter 5 à 15 s. Le texte du document est envoyé à Claude
pour cette relecture. Pas de correction en direct pendant la frappe.
