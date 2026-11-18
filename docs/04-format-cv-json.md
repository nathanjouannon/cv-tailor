# 04 — Format du CV (JSON)

Un modèle de CV est un fichier `data/modeles/<id>.json`. Une candidature contient une copie
modifiée du même format dans `data/candidatures/<id>/cv.json`. Tous les templates lisent ce format
unique : changer de template ne change pas le contenu.

## Exemple complet

```json
{
  "id": "developpeur-fr",
  "nom": "Développeur full-stack (FR)",
  "langue": "fr",
  "template": "classique",
  "identite": {
    "prenom": "Nathan",
    "nom": "Dupont",
    "titre": "Développeur full-stack",
    "email": "nathan@exemple.fr",
    "telephone": "+33 6 00 00 00 00",
    "adresse": "Lyon, France",
    "liens": [
      { "label": "linkedin.com/in/nathan", "url": "https://linkedin.com/in/nathan" },
      { "label": "github.com/nathan", "url": "https://github.com/nathan" }
    ]
  },
  "resume": "Trois phrases qui résument le profil et l'objectif.",
  "sections": ["experiences", "competences", "formations", "projets", "langues", "certifications", "interets"],
  "titres": {
    "resume": "Profil",
    "experiences": "Expériences",
    "competences": "Compétences",
    "formations": "Formation",
    "projets": "Projets",
    "langues": "Langues",
    "certifications": "Certifications",
    "interets": "Centres d'intérêt"
  },
  "experiences": [
    {
      "poste": "Développeur full-stack",
      "entreprise": "ACME",
      "lieu": "Lyon",
      "debut": "2023",
      "fin": "aujourd'hui",
      "description": "Une ligne de contexte (optionnel).",
      "points": [
        "Conçu une API REST Node.js servant 200 k requêtes/jour.",
        "Migré le front vers React, -40 % de temps de chargement."
      ]
    }
  ],
  "formations": [
    {
      "diplome": "Master Informatique",
      "etablissement": "Université Lyon 1",
      "lieu": "Lyon",
      "debut": "2019",
      "fin": "2021",
      "details": "Mention bien. Spécialité génie logiciel."
    }
  ],
  "competences": [
    { "categorie": "Langages", "items": ["JavaScript", "TypeScript", "Python", "SQL"] },
    { "categorie": "Frameworks", "items": ["Node.js", "React", "Express"] },
    { "categorie": "Outils", "items": ["Git", "Docker", "GitHub Actions"] }
  ],
  "projets": [
    { "nom": "CV Tailor", "description": "Outil d'adaptation de CV aux offres.", "lien": "github.com/nathan/cv-tailor", "points": [] }
  ],
  "langues": [
    { "langue": "Français", "niveau": "Langue maternelle" },
    { "langue": "Anglais", "niveau": "C1" }
  ],
  "certifications": [
    { "nom": "AWS Cloud Practitioner", "organisme": "Amazon", "date": "2024" }
  ],
  "interets": ["Escalade", "Photographie"]
}
```

## Règles

| Champ | Type | Obligatoire | Notes |
|---|---|---|---|
| `id` | slug `[a-z0-9-]` | oui | Nom du fichier. Généré depuis `nom` à l'import si absent. |
| `nom` | texte | oui | Affiché dans la liste des modèles. |
| `langue` | `"fr"` ou `"en"` | oui | Pilote les titres par défaut et l'attribut `lang` du document. |
| `template` | id d'un dossier de `templates/` | oui | Repli sur `classique` si inconnu. |
| `identite` | objet | oui | `prenom`, `nom`, `titre` au minimum. `liens` : tableau, peut être vide. |
| `resume` | texte | non | Paragraphe d'accroche. Vide = section masquée. |
| `sections` | tableau d'ids | non | Ordre d'affichage. Par défaut : l'ordre de l'exemple. Une section absente du tableau n'est pas rendue. |
| `titres` | objet | non | Remplace les titres par défaut (FR ou EN selon `langue`). |
| `experiences[]` | objets | non | `points` = puces. `description` optionnelle. |
| `formations[]` | objets | non | |
| `competences[]` | objets `{categorie, items[]}` | non | C'est la section la plus lue par les ATS : y placer les mots-clés exacts. |
| `projets[]` | objets | non | |
| `langues[]` | objets `{langue, niveau}` | non | |
| `certifications[]` | objets | non | |
| `interets[]` | textes | non | |

Un tableau vide masque la section correspondante dans le rendu.

## Titres par défaut

| Section | `langue: fr` | `langue: en` |
|---|---|---|
| resume | Profil | Profile |
| experiences | Expériences professionnelles | Experience |
| competences | Compétences | Skills |
| formations | Formation | Education |
| projets | Projets | Projects |
| langues | Langues | Languages |
| certifications | Certifications | Certifications |
| interets | Centres d'intérêt | Interests |

## Import / export

- **Importer** (panneau Modèles) : un fichier `.json` dans ce format. L'`id` est régénéré s'il existe déjà.
- **Exporter** : télécharge le JSON du modèle ou de la candidature pour le versionner ou le partager.
- Le fichier est lisible et modifiable à la main dans n'importe quel éditeur de texte.
