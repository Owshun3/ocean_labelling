contributing_content = """# Guide de Contribution - Open Data Polynésie

Ce document définit les standards techniques stricts pour le développement du frontend mobile.

## 1. Standards de Code
* **TypeScript Strict :** Interdiction totale du type `any`. Utilisation systématique des interfaces pour les modèles de données.
* **Immuabilité :** Modification des états interdite par mutation directe. Utilisation obligatoire de l'opérateur spread (`...`) et du mot-clé `readonly` dans les interfaces.
* **Composants :** Séparation entre *Smart Components* (logique/hooks) et *Dumb Components* (présentation pure).

## 2. Convention de Nommage
* **Fichiers :** `kebab-case` (ex: `media-card.tsx`).
* **Composants :** `PascalCase` (ex: `ReviewDashboard`).
* **Fonctions/Variables :** `camelCase`.

## 3. Workflow Git
Nous suivons les [Conventional Commits](https://www.conventionalcommits.org/).
* `feat:` Nouvelle fonctionnalité.
* `fix:` Correction de bug.
* `arch:` Changement d'architecture ou de structure de fichiers.
* `refactor:` Modification de code sans changement fonctionnel.

## 4. Performance
* **Recherche :** Utilisation de l'algorithme KMP pour les filtrages textuels complexes.
* **Complexité :** Toute solution supérieure à O(n) doit faire l'objet d'une justification technique en commentaire.
"""