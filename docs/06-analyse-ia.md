# 06 — Analyse de l'offre par Claude

## Principe

Le serveur exécute la CLI Claude Code installée sur la machine, en mode non interactif, avec un
schéma JSON de sortie. L'authentification est celle de l'abonnement claude.ai déjà connecté
(`claude` a été vérifié fonctionnel le 12 nov. 2026, version 2.1.322).

```
claude -p \
  --output-format json \
  --json-schema '<schéma ci-dessous>' \
  --system-prompt '<instructions>' \
  --tools "" \
  --no-session-persistence \
  [--model <claudeModel>] [--effort <claudeEffort>]
  < texte de l'offre (stdin)
```

- `--tools ""` : aucun outil, donc aucune demande de permission, aucun accès disque.
- `--no-session-persistence` : rien n'est écrit dans l'historique de sessions Claude Code.
- Répertoire de travail : `data/` (pas de `CLAUDE.md` ni de réglages projet chargés).
- Délai maximal : 180 s, puis erreur « analyse trop longue ».
- La réponse utile est le champ `structured_output` du JSON renvoyé ; `is_error` et `subtype`
  sont contrôlés. `duration_ms` est affiché dans l'interface.

Voir `server/lib/analyze.js`.

## Instructions (system prompt)

Résumé du prompt (texte exact dans `analyze.js`) :

- Tu es un expert ATS et recrutement. On te donne une offre d'emploi brute.
- Détecte la langue de l'offre (`fr` ou `en`). Les mots-clés sont dans **la langue de l'offre**,
  avec l'orthographe exacte qu'un ATS comparerait. Les conseils sont **en français**.
- Extrais 15 à 35 mots-clés dédupliqués, chacun avec une catégorie, une importance et des variantes
  (synonymes, sigles, pluriels) pour la détection dans le CV.
- Importance `haute` = répété ou marqué obligatoire ; `moyenne` = demandé une fois ; `basse` = souhaité.
- Liste les exigences (phrase courte, obligatoire ou non).
- Donne 3 à 6 conseils concrets pour adapter le CV, sans inventer d'expérience.
- Ne produis rien d'autre que le JSON.

## Schéma de sortie

```json
{
  "titre_poste": "string",
  "entreprise": "string",
  "lieu": "string",
  "type_contrat": "string",
  "langue": "fr | en",
  "resume": "string (2-3 phrases, en français)",
  "mots_cles": [
    {
      "terme": "string",
      "categorie": "competence_technique | outil | soft_skill | methodologie | certification | domaine | langue | diplome | autre",
      "importance": "haute | moyenne | basse",
      "variantes": ["string"]
    }
  ],
  "exigences": [ { "texte": "string", "obligatoire": true } ],
  "conseils": ["string"]
}
```

Le schéma est transmis à `--json-schema`, la CLI garantit la conformité structurelle.
Le serveur revalide les types, borne les tableaux et supprime les doublons de termes.

## Score ATS (côté client, `public/js/match.js`)

1. Le CV rendu est converti en texte brut, normalisé : minuscules, accents retirés, ponctuation
   remplacée par des espaces, espaces multiples réduits.
2. Chaque mot-clé et chacune de ses variantes sont normalisés de la même façon.
3. Un mot-clé est **trouvé** s'il apparaît en mots entiers (frontières de mots), avec tolérance
   d'un `s` final. `C++`, `C#`, `.NET`, `Node.js` sont gérés par la normalisation symétrique.
4. Poids : haute = 3, moyenne = 2, basse = 1.
   **Score = somme des poids trouvés / somme des poids × 100**, arrondi.
5. L'interface affiche le score, le compte trouvés / total, et deux listes : présents, manquants.
   Les mots-clés manquants `haute` sont en tête.

Le score est un indicateur de couverture lexicale, pas une prédiction de réussite. Il se recalcule
à chaque modification du CV (débounce 150 ms).

## Surlignage

Dans l'aperçu, chaque occurrence trouvée est entourée de `<mark class="kw" data-importance="…">`.
Le surlignage se fait sur les nœuds texte du DOM rendu, jamais dans le HTML envoyé au PDF.

## Coût et confidentialité

- Une analyse consomme environ 3 à 8 k tokens d'entrée et 1 à 2 k de sortie, imputés à l'abonnement.
- Seul le texte de l'offre quitte la machine. Le CV n'est jamais transmis (décision D4).

## Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| « commande claude introuvable » | `~/.local/bin` absent du PATH du lanceur | Vérifier `which claude` (macOS/Linux) ou `where claude` (Windows) ; sinon renseigner le chemin dans Réglages → « Chemin de la commande claude ». |
| « non connecté » / erreur d'auth | Session claude.ai expirée | Lancer `claude` dans un terminal et exécuter `/login`. |
| Analyse > 60 s | Offre très longue ou modèle lent | Réduire le texte collé ou choisir un modèle plus rapide dans Réglages (`claudeModel: "sonnet"`). |
| JSON invalide | Très rare avec `--json-schema` | Relancer l'analyse ; le message d'erreur contient la sortie brute. |
