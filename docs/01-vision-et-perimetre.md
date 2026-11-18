# 01 — Vision et périmètre

## Problème

Les candidatures passent d'abord par un ATS (Applicant Tracking System) qui filtre les CV sur la
présence de mots-clés et de compétences extraits de l'offre. Un bon CV générique est souvent écarté
faute de reprendre le vocabulaire exact de l'offre.

## Objectif

Permettre, en quelques minutes, de :

1. coller le texte d'une offre d'emploi ;
2. obtenir la liste des compétences et mots-clés importants, avec leur poids ;
3. choisir un de ses modèles de CV ;
4. le modifier dans un éditeur structuré en voyant en direct quels mots-clés sont présents ou manquants ;
5. exporter un PDF A4 d'une page, fidèle au design du modèle ;
6. retrouver chaque candidature (offre, analyse, CV adapté, PDF) plus tard.

## Utilisateur

Un seul utilisateur, sur sa machine (macOS, Windows ou Linux), hors ligne sauf pour l'appel à Claude.
Pas de compte, pas d'authentification, pas de serveur distant.

## Inclus dans la v1

- Interface web locale en HTML / CSS / JavaScript sans framework, servie par un petit serveur Node.
- Zone gauche : offre, analyse, modèles, candidatures. Plein écran quand aucun CV n'est ouvert.
- Zone droite : formulaire par sections + aperçu A4 en temps réel, apparaît quand un CV est ouvert.
- Analyse de l'offre par Claude via la commande `claude` déjà installée (abonnement claude.ai).
- Détection de la langue de l'offre (français ou anglais), mots-clés dans cette langue.
- Score de correspondance ATS recalculé à chaque frappe, mots-clés surlignés dans l'aperçu.
- Modèles de CV = contenu structuré JSON + design HTML/CSS. Import / export JSON, duplication.
- Indicateur de débordement si le CV dépasse une page A4.
- Export PDF en un clic côté serveur (Puppeteer / Chromium), rendu identique à l'aperçu.
- Historique local : un dossier par candidature dans `data/candidatures/`.
- Lancement par double-clic sur `CVTailor.command` (macOS) ou `CVTailor.bat` (Windows), `./CVTailor.sh` (Linux).

## Exclu de la v1 (voir décisions et roadmap)

- Import `.docx` / `.pages` : les designs sont recréés une fois en HTML/CSS, le contenu est saisi ou
  importé en JSON.
- Réécriture automatique du CV par l'IA : l'IA suggère, l'utilisateur écrit.
- Récupération d'une offre depuis une URL.
- Profil maître partagé entre modèles.
- Application Electron, multi-utilisateur, synchronisation cloud.
