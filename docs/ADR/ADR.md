# ADR-001 : Adoption du Feature-Driven Design (FDD)

* **Statut :** Accepté
* **Date :** 2026-04-16

## Contexte
Le template par défaut d'Expo propose une structure à plat (`components/`, `hooks/`) qui devient illisible lors de la montée en charge. Le projet nécessite une gestion multi-rôles complexe.

## Décision
Migration vers une structure par fonctionnalités (Features). Chaque module métier (Auth, Annotation, Admin) encapsule ses propres composants et logique.

## Conséquences
* **Positives :** Isolation des domaines, réduction du couplage, facilité de tests unitaires.
* **Négatives :** Nécessite une configuration rigoureuse des alias de chemins dans `tsconfig.json`.

---

# ADR-002 : Utilisation exclusive de l'API Native CVAT

* **Statut :** Accepté
* **Date :** 2026-04-16

## Contexte
L'hypothèse d'un backend intermédiaire (Laravel/MariaDB) a été soulevée. 

## Décision
Abandon de la couche PHP/MariaDB. Nous utilisons directement l'API Django/PostgreSQL de CVAT.

## Justification
Éviter le phénomène de "Split-Brain" (fragmentation des données). Maintenir une Source Unique de Vérité (SSOT) au sein du cœur CVAT pour garantir l'intégrité des annotations et des comptes utilisateurs.

---

# ADR-003 : Topologie Conteneurisée et Reverse Proxy (NGINX)

* **Statut :** Accepté
* **Date :** 2026-04-28

## Contexte
L'application nécessite un contrôle strict des flux réseau entre le client React, le moteur CVAT, et le studio d'annotation, tout en masquant l'interface par défaut de CVAT aux utilisateurs finaux.

## Décision
Adoption d'une architecture à 3 conteneurs principaux :
1. **Frontend (Appli) :** Application React propulsée par Expo Web.
2. **Backend (CVAT) :** Moteur d'annotation natif.
3. **Gateway (NGINX) :** Reverse proxy frontal orchestrant les interactions.

## Détails Techniques et Sécurité
* **Blocage UI CVAT :** NGINX est configuré pour renvoyer une erreur `403 Forbidden` sur toutes les requêtes ciblant l'interface utilisateur standard de CVAT. Seules les routes `/api/` sont autorisées.
* **Routage :** NGINX intercepte les requêtes du frontend, injecte dynamiquement les headers requis (CORS, Authorization) et route les flux vers CVAT de manière transparente.

---

# ADR-004 : Stratégie de Navigation et Encapsulation du Studio

* **Statut :** Supersédé par ADR-006
* **Date :** 2026-04-28

## Contexte
Il est nécessaire de définir le moteur de routage interne de l'application cliente et la méthode d'intégration du studio d'annotation CVAT.

## Décision
* **Navigation Interne :** Utilisation stricte d'`expo-router` pour la gestion des vues React et du cycle de vie de la navigation au sein de la plateforme.
* **Intégration du Studio :** Le routage vers le studio d'annotation s'effectuera via le reverse proxy NGINX. 
* **Phase de transition :** L'intégration débutera par une phase de test technique utilisant une `<iframe>` pour encapsuler le studio dans l'UI React. Une bascule vers une redirection native (via NGINX ou `window.open`) est planifiée en cas de blocages persistants liés aux politiques de sécurité des navigateurs (X-Frame-Options).

> **Note (2026-04-29) :** La phase iframe a été évaluée et abandonnée. Voir ADR-006 pour la décision finale et sa justification complète.

---

# ADR-005 : Déploiement d'une Base de Données Annexe (RBAC & Configurations)

* **Statut :** Accepté
* **Date :** 2026-04-28

## Contexte
L'API native de CVAT est insuffisante pour gérer nos logiques métiers spécifiques : elle ne possède pas d'équivalent pour notre matrice de rôles (Curateur, Modérateur) ni de système natif pour distribuer des jetons d'accès temporaires (Worklow Invité). De plus, la modification des paramètres système par l'administrateur nécessite actuellement une intervention manuelle dans les fichiers.

## Décision
Mise en place d'une base de données applicative légère et externe à CVAT. Cette base aura pour rôles stricts et exclusifs :
1. Le stockage de la matrice RBAC (Role-Based Access Control) étendue.
2. La génération et la validation des jetons d'invitation.
3. Le stockage des paramètres de l'interface d'administration Web.
4. L'historisation du renommage des fichiers à l'ingestion (`Identifiant_Date_Index`).

## Conséquences et Risques
* **Positives :** Découple la logique applicative spécifique de l'infrastructure CVAT, permettant de conserver un moteur d'annotation standard et facile à mettre à jour. Fournit un contrôle total sur l'interface d'administration.
* **Négatives (Risque Architecturaux) :** Rupture partielle de l'ADR-002. Cela induit un risque de corruption relationnelle. 
* **Mesure d'atténuation :** Il est impératif d'implémenter un mécanisme de jointure stricte où notre base annexe utilise l'`ID utilisateur` natif de CVAT comme clé étrangère irréfutable. Aucune donnée d'annotation ne doit transiter par cette base.

---

# ADR-006 : Injection NGINX comme stratégie d'encapsulation du studio CVAT (supersède ADR-004)

* **Statut :** Accepté
* **Date :** 2026-04-29
* **Supersède :** ADR-004

## Contexte
ADR-004 prévoyait une phase de test via `<iframe>` avant une éventuelle bascule vers NGINX. Cette phase a été évaluée et conclut en faveur d'une injection NGINX directe. Voir le fichier détaillé : [`docs/ADR/ADR-006.md`](ADR/ADR-006.md).

## Décision
Le studio d'annotation CVAT est intégré via injection NGINX (`sub_filter`) : le HTML retourné par `cvat_ui:8000` est enrichi côté serveur avant d'atteindre le navigateur, sur la même origine.

## Pourquoi pas l'iframe
CVAT émet des headers `X-Frame-Options` et `CSP frame-ancestors` qui bloquent l'embedding cross-origin. Les contourner nécessiterait de modifier CVAT — interdit. De plus, la Same-Origin Policy empêche toute injection CSS/JS dans une iframe cross-origin, rendant impossible le masquage du header et le bouton de validation.

## Avantages de l'injection NGINX
* Même origine → accès DOM complet, cookies partagés, aucune restriction navigateur.
* CSS injectée pour masquer le header CVAT natif.
* JS injecté pour le bouton "Valider et terminer", le blocage de navigation SPA, et les extensions futures.
* **Création de labels en live** : un panneau latéral injecté pourra appeler `PATCH /api/tasks/{id}` pour ajouter des labels à la volée sans toucher à CVAT.
* **Studio curateur** : une UI de comparaison multi-annotateurs injectable via la même mécanique, s'appuyant sur `/api/consensus/` et `/api/quality/`.

## Maintenabilité
Bonne séparation des responsabilités : toute la logique d'injection est isolée dans `nginx/nginx.conf`, sans dépendance dans le frontend ni dans app-api. Dette identifiée : le JS est actuellement inline dans nginx.conf — à externaliser en fichiers statiques versionnés pour permettre lint et tests unitaires.