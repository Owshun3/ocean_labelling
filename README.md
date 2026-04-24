# Open Data Polynésie (Nom Temporaire) - Architecture & Frontend Client

## 1. Description du Système
Application mobile "Headless" développée avec Expo (React Native) s'interfaçant avec une infrastructure backend CVAT (Computer Vision Annotation Tool). 
Le système gère l'ingestion, la curation et l'annotation de données environnementales polymorphes via un système de rôles stricts et de validation par consensus. L'interface utilisateur native de CVAT est volontairement masquée pour offrir une expérience personnalisée et contrôlée.

## 2. Architecture et Stack Technologique (Topologie à 3 Conteneurs)
L'infrastructure repose sur un triptyque strict pour isoler les responsabilités :
* **1. Frontend (Appli) :** React Native / Expo Router (TypeScript strict). Gère la navigation, les vues, et l'état local.
* **2. Gateway (NGINX) :** Reverse Proxy agissant comme bouclier de sécurité et routeur.
    * Bloque l'accès direct à l'interface UI native de CVAT (`403 Forbidden`).
    * Expose uniquement les routes `/api/` nécessaires au frontend.
    * Encapsule le studio d'annotation (stratégie initiale via IFrame, bascule prévue vers redirection/`window.open` en cas de blocage X-Frame-Options).
* **3. Backend (Upstream CVAT) :** Moteur d'annotation (Django / PostgreSQL / Redis). Utilisé comme Source Unique de Vérité (SSOT) via son API REST.
* **Couche Réseau & Sécurité :** Authentification "Stateless" en Token-Bearer pur. Suppression totale du couplage aux cookies de session pour éviter les blocages CSRF cross-origin.

## 3. Topologie du Code Source (Feature-Driven Design)
L'architecture applique une séparation stricte des préoccupations (Domain Isolation) validée par l'ADR-001 :

\`\`\`text
src/
├── core/             # Contrats statiques (Types), variables globales, algorithmes isolés.
├── features/         # Logique métier cloisonnée.
│   ├── admin/        # CRUD Utilisateurs, audits.
│   ├── annotation/   # Hub d'annotation, mapping Tâches/Jobs et intégration CVAT.
│   ├── auth/         # Authentification, Inscription et gestion des Tokens JWT.
│   ├── gamification/ # Système de progression (Paliers: Bronze à Platinium).
│   ├── media/        # Flux I/O de téléversement asynchrone et gestion RGPD (suppression physique).
│   └── moderation/   # Validation en masse et assignations.
├── hooks/            # Encapsulation des cycles de vie React (UI State, Polling).
├── services/         # Couche réseau (Client Axios, respect strict des Trailing Slashes Django).
└── shared/           # Composants UI atomiques et immutables.
\`\`\`

## 4. Règles d'Ingénierie Stricte
* **Programmation Défensive :** Aucune confiance aveugle envers les réponses API. Validation des pré-conditions systématique ($O(1)$) avant appel réseau et structures immuables.
* **Conformité API REST :** Respect absolu de la syntaxe de routage Django (utilisation du *trailing slash* `/` sur les endpoints d'authentification pour éviter les redirections 301 destructrices de payload).
* **Algorithmique Spécifique :** Implémentation du pattern matching KMP (Knuth-Morris-Pratt) pour les filtres textuels complexes, garantissant une complexité temporelle de $O(n + m)$.
* **Sécurité et RGPD :** * Principe du moindre privilège appliqué aux accès API.
    * Consentement explicite bloquant au téléversement. Suppression physique et définitive des tâches (`DELETE`) lors de la rétractation.
    * Zéro exposition d'adresses IP dans les logs système (Anonymisation stricte).

## 5. Contrôle d'Accès Basé sur les Rôles (RBAC)
Le flux de données est conditionné par une hiérarchie stricte :
1.  **Administrateur :** Paramétrage global, CRUD utilisateur, accès exclusif à l'export des données, assignation manuelle des tâches.
2.  **Modérateur :** Vue globale sur la file d'attente, validation/refus d'annotations en lot.
3.  **Curateur :** Action circonscrite aux assignations explicites de l'Admin. 
4.  **Utilisateur Lambda :** Téléversement, suivi personnel (En attente/Validé/Refusé), annotation de données publiques, signalement de validation.

## 6. Déploiement Local (Environnement de Développement)
Pré-requis : Node.js (v20 LTS), Docker Engine (v24+).
1. Configurer les variables d'environnement réseau dans `.env` (ex: `EXPO_PUBLIC_API_URL` ciblant l'IP du Proxy NGINX).
2. S'assurer de la présence du fichier `docker-compose.override.yml` dans le cœur CVAT exposant `CVAT_REST_API_SIGNUP: 'True'` pour autoriser les inscriptions de test.
3. Installer les dépendances : `npm ci` (verrouillage des versions requises).
4. Lancer le serveur de développement avec purge de cache : `npx expo start -c`