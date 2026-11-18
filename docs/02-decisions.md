# 02 — Décisions (12 novembre 2026)

Réponses de Nathan aux questions posées avant le développement. Chaque décision est définitive
pour la v1 ; une évolution se traite dans [08-roadmap.md](08-roadmap.md).

| # | Sujet | Décision | Alternatives écartées | Pourquoi |
|---|---|---|---|---|
| D1 | Moteur IA | **Claude Code local** : le serveur lance `claude -p … --json-schema` | Clé API Anthropic ; les deux ; extraction locale sans IA | Déjà installé et connecté au compte claude.ai (abonnement). Aucune clé à gérer, aucune facturation à l'usage. Sortie JSON structurée garantie par `--json-schema`. |
| D2 | Modèles de CV | **Recréer les designs en HTML/CSS**, contenu en JSON | Import `.docx` converti en HTML ; hybride | Fidélité du PDF. Les `.pages` sont exportés en PDF comme référence visuelle et chaque design est recréé une fois. 1 à 2 modèles simples en une colonne. |
| D3 | Éditeur | **Formulaire par sections + aperçu live** | WYSIWYG libre ; éditeur de code Markdown/HTML | Contenu structuré, donc surlignage des mots-clés fiable et score calculable. Aperçu identique au PDF. |
| D4 | Assistance IA | **Suggestions seulement** | Réécriture par section à la demande ; génération complète | Nathan garde la main sur le texte. L'IA renvoie mots-clés, exigences, conseils. Pas de risque d'invention de compétences. |
| D5 | Historique | **Un dossier par candidature** dans `data/candidatures/` | Export PDF seul | Retrouver et re-exporter une candidature ; comparer les versions. |
| D6 | Export PDF | **Bouton 1 clic côté serveur** (Puppeteer) | Impression navigateur ; les deux | Rendu stable, pas d'étape manuelle. Chromium téléchargé une fois (~170 Mo) à l'installation. |
| D7 | Langues | **Français + anglais** | Français seul | Offres dans les deux langues. L'interface est en français ; l'analyse détecte la langue de l'offre et renvoie les mots-clés dans cette langue ; chaque modèle a une langue. |
| D8 | Lancement | **Double-clic sur `CVTailor.command`** | `npm start` ; Electron | Simple, zéro installation supplémentaire, le serveur ouvre le navigateur. |
| D9 | Longueur | **1 page A4 stricte** avec indicateur de débordement | 2 pages ; libre | Standard des CV en France pour un profil junior/intermédiaire. L'aperçu signale tout dépassement. |
| D10 | Saisie de l'offre | **Texte collé uniquement** | Texte + URL | Les sites d'offres bloquent la récupération automatique. Fiable à 100 %. |
| D11 | Nombre de modèles | **1 à 2 modèles, une colonne, sans photo** | Designs riches ; 5+ | Deux templates livrés (`classique`, `moderne`) prêts à être ajustés aux designs `.pages` de Nathan. |
| D12 | Profil maître | **Non** : chaque modèle est un CV complet | Profil maître partagé | Plus simple ; on adapte un CV existant à la marge. |

## Décisions techniques prises par Claude (non bloquantes)

| Sujet | Choix | Raison |
|---|---|---|
| Langage | Node.js 20 (serveur) + HTML/CSS/JS vanille (client), modules ES | Préférence HTML/CSS/JS de Nathan ; Node déjà installé ; Puppeteer et `child_process` imposent un serveur local. |
| Framework serveur | Express 4 | Minimal, connu, suffisant pour une dizaine de routes. |
| Framework client | Aucun | Une seule page, état simple, pas de build. |
| Port | 3030 (modifiable dans `data/config.json`) | Évite les ports 3000/8080 souvent occupés. |
| Moteur de templates | Mini moteur maison (`{{champ}}`, `{{#each}}`, `{{#if}}`) partagé client/serveur | Pas de dépendance, templates lisibles en HTML pur, même rendu dans l'aperçu et dans le PDF. |
| Calcul du score ATS | Côté client, en JS, sur le texte rendu du CV | Instantané à chaque frappe, pas d'appel réseau. |
| Modèle Claude | Celui par défaut de Claude Code ; surchargeable dans `data/config.json` (`claudeModel`) | Suit les réglages de l'abonnement. |
| Appel à `claude` | `--tools ""`, `--no-session-persistence`, `--system-prompt`, offre passée sur stdin | Pas d'outils donc pas de permission demandée ; pas de session sauvegardée ; prompt court et stable. |
| Dossier de travail de `claude` | `data/` | Évite de charger un `CLAUDE.md` ou des réglages projet. |
| Sauvegarde | Auto-enregistrement 800 ms après la dernière modification | Aucune perte de travail, pas de bouton obligatoire. |
| Polices | Arial partout (exigence ATS) | Aucun téléchargement, rendu identique aperçu / PDF sur la même machine. |

## Évolutions après la v1

- **12 nov. 2026, D2 et D4 assouplies pour une fonction précise** : « Importer un CV » (onglet Modèles) accepte un `.docx` + un PDF et crée le modèle et le template automatiquement. Claude y lit le contenu du CV, uniquement pour cet import. Détails dans [09-import-cv.md](09-import-cv.md). Le reste de l'outil respecte toujours D2 et D4.
