# Open Data Polynésie (Nom Temporaire) - Frontend Client

## 1. Description du Système
Application mobile "Headless" développée avec Expo (React Native) s'interfaçant avec une infrastructure backend CVAT (Computer Vision Annotation Tool). 
Le système gère l'ingestion, la curation et l'annotation de données environnementales polymorphes via un système de rôles stricts et de validation par consensus.

## 2. Architecture et Stack Technologique
* **Frontend :** React Native / Expo Router (TypeScript strict).
* **Gestion d'état & Requêtes :** Custom Hooks, Axios (avec intercepteurs JWT).
* **Backend (Upstream) :** Architecture CVAT (Django / PostgreSQL / Redis).
* **Infrastructure Réseau :** Reverse Proxy NGINX conteneurisé (Contournement des contraintes d'iFrame et injection d'Authorization Headers).

## 3. Topologie du Code Source (Feature-Driven Design)
L'architecture applique une séparation stricte des préoccupations (Domain Isolation) :

\`\`\`text
src/
├── core/             # Contrats statiques (Types), variables globales, algorithmes isolés.
├── features/         # Logique métier cloisonnée.
│   ├── admin/        # CRUD Utilisateurs, audits.
│   ├── gamification/ # Système de progression (Paliers: Bronze à Platinium).
│   ├── media/        # Flux I/O de téléversement et gestion RGPD.
│   └── moderation/   # Validation en masse et assignations.
├── hooks/            # Encapsulation des cycles de vie React (UI State).
├── services/         # Couche réseau (Inversion de dépendance : Mocks & API réelle).
└── shared/           # Composants UI atomiques et immutables.
\`\`\`

## 4. Règles d'Ingénierie Stricte
* **Programmation Défensive :** Aucune confiance aveugle envers les réponses API. Validation des pré-conditions systèmatique et structures immuables (utilisation de l'opérateur spread et `readonly`).
* **Algorithmique Spécifique :** Implémentation du pattern matching KMP (Knuth-Morris-Pratt) pour les filtres textuels complexes, garantissant une complexité temporelle de $O(n + m)$.
* **Sécurité et RGPD :** * Principe du moindre privilège appliqué aux accès API.
    * Consentement explicite bloquant au téléversement.
    * Zéro exposition d'adresses IP dans les logs système (Anonymisation stricte).

## 5. Contrôle d'Accès Basé sur les Rôles (RBAC)
Le flux de données est conditionné par une hiérarchie stricte :
1.  **Administrateur :** Paramétrage global, CRUD utilisateur, accès exclusif à l'export des données, assignation manuelle des tâches.
2.  **Modérateur :** Vue globale sur la file d'attente, validation/refus d'annotations en lot.
3.  **Curateur :** Action circonscrite aux assignations explicites de l'Admin. 
4.  **Utilisateur Lambda :** Téléversement, suivi personnel (En attente/Validé/Refusé), annotation de données publiques, signalement de validation.

## 6. Déploiement Local (Environnement de Développement)
Pré-requis : Node.js (v20 LTS), Docker Engine (v24+).
1. Configurer les variables d'environnement réseau dans `.env` (ex: ciblage de l'IP du Proxy NGINX).
2. Installer les dépendances : `npm ci` (verrouillage des versions requises).
3. Lancer le serveur de développement : `npx expo start -c`