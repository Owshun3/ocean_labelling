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

## Précisions techniques

**CVAT ne permet pas d'étendre la liste des rôles :** les rôles CVAT sont des constantes du code source (enum dans `cvat-core`). CVAT expose uniquement le CRUD des *assignations* (`PATCH /memberships/{id}`) — pas le CRUD des *types* de rôles. Ajouter curator, moderator ou guest à l'enum exigerait un fork de `cvat-core`, ce qu'interdit ADR-002. C'est pourquoi ces rôles supplémentaires sont entièrement définis et stockés dans notre base annexe, sans aucun écho côté CVAT.

**Qui peut modifier les rôles dans CVAT :** owner **et** maintainer peuvent modifier l'assignation des rôles des membres d'une organisation CVAT. La contrainte n'est donc pas « qui peut promouvoir » mais « vers quels rôles » : l'enum CVAT ne contient pas curator, moderator ni guest — aucune promotion vers ces rôles n'est possible côté CVAT, indépendamment de l'acteur.

**Principe architectural « CVAT décide en dernier » :** on peut ajouter des *restrictions* par-dessus CVAT via app-api, jamais des *extensions*. Toute action qui transite par `/api/` est arbitrée par CVAT en dernier ressort — CVAT renverra 403 avant qu'app-api ne soit consulté. L'app-api joue donc un rôle de couche de contrôle additionnel (restriction, enrichissement de réponse), jamais d'extension des permissions CVAT.

---

# ADR-006 : Injection NGINX comme stratégie d'encapsulation du studio CVAT (supersède ADR-004)

* **Statut :** Accepté
* **Date :** 2026-04-29
* **Supersède :** ADR-004 (Stratégie de Navigation et Encapsulation du Studio)

## Contexte

ADR-004 prévoyait une phase de test via `<iframe>` avant une éventuelle bascule vers NGINX. Cette phase a été évaluée et conclut en faveur d'une injection NGINX directe. Cette section fige la décision finale et en documente la justification complète.

Le besoin est le suivant : intégrer le studio d'annotation CVAT dans notre plateforme en :
- masquant l'interface native CVAT (header, navigation) ;
- injectant des comportements personnalisés (bouton de validation, blocage navigation SPA) ;
- laissant la porte ouverte à des extensions futures (création de labels, studio curateur).

## Fonctionnement d'une iframe et ses limites dans ce contexte

Une `<iframe>` embarque un document HTML externe dans la page parente. La page parente et le contenu de l'iframe restent deux contextes d'exécution séparés et soumis à la **Same-Origin Policy** du navigateur.

### Blocages techniques rencontrés avec CVAT

| Contrainte | Impact |
|---|---|
| **`X-Frame-Options: SAMEORIGIN`** ou **`CSP: frame-ancestors`** | CVAT envoie ces headers. Le navigateur refuse d'afficher le contenu dans une iframe dès que l'origine diffère, ou selon la configuration stricte. Contournable uniquement en modifiant CVAT — interdit par l'ADR-002 et notre contrainte boîte noire. |
| **Same-Origin Policy** | Depuis la page parente, il est impossible de lire ou modifier le DOM d'une iframe cross-origin. On ne peut pas injecter de CSS pour masquer le header CVAT, ni de JS pour ajouter le bouton de validation. |
| **Cookies tiers** | Les navigateurs modernes (Safari ITP, Firefox ETP, Chrome Phase-out) bloquent les cookies `SameSite=Lax/Strict` dans les iframes cross-origin. L'authentification CVAT par session cookie serait cassée. |
| **Expérience utilisateur** | Double scrollbar, gestion du redimensionnement complexe sur mobile, canvas WebGL potentiellement dégradé dans un contexte d'iframe imbriqué. |

En résumé : une intégration via iframe nécessiterait de modifier CVAT (headers, cookies), ce qui viole la contrainte fondamentale du projet.

Concrètement, l'approche iframe interdirait les trois interventions qui constituent le studio Ocean :

| Intervention | Fichier | Lignes |
|---|---|---|
| Masquer le header CVAT natif | `ocean-studio.js` | 46–55 |
| Injecter la barre custom (input label + bouton Valider) | `ocean-studio.js` | 57–224 |
| Bloquer la navigation SPA hors `/tasks/N/jobs/M` via override `pushState`/`replaceState` | `ocean-studio.js` | 315–319 |

Toutes trois requièrent que notre JS s'exécute dans le contexte de la page CVAT — donc sur la même origine que CVAT — ce qu'autorise le reverse proxy (`localhost:8888` est commune au studio et à l'app) mais qu'interdirait un iframe cross-origin.

## Décision : injection NGINX via `sub_filter`

### Principe

NGINX joue ici **deux rôles distincts** qu'il importe de ne pas confondre :

1. **Reverse proxy** — `proxy_pass` route les requêtes selon l'URL : `/api/` vers `cvat_server:8080`, `/` vers `cvat_ui:8000`, `/app-api/` vers `app-api:3000`.
2. **Content-rewriting** — la directive `sub_filter` modifie le HTML retourné par `cvat_ui:8000` *avant* qu'il n'atteigne le navigateur, en injectant `ocean-theme.css`, `ocean-studio.css` et `ocean-studio.js` dans `<head>` (`nginx/nginx.conf:68`).

C'est ce second rôle qui est **irremplaçable par un iframe** : un reverse proxy seul ne suffisait pas.

```
Navigateur → NGINX → cvat_ui:8000
                ↑
         sub_filter injecte
         CSS + JS dans <head>
```

Parce que NGINX sert le contenu sur le **même domaine et port** que notre application (`localhost:8888`), il n'y a aucune contrainte cross-origin. Le JS injecté a accès complet au DOM, aux cookies, et à l'API CVAT.

### Ce qui est injecté aujourd'hui

**CSS :** masquage du header CVAT natif (`[class*="cvat-header"]`, `header.ant-layout-header`).

**JS — bouton "Valider et terminer" :**
1. Extrait `taskId` et `jobId` de l'URL.
2. Attend l'apparition du canvas CVAT via `MutationObserver`.
3. Déclenche `Ctrl+S` (sauvegarde CVAT native).
4. Appelle `PATCH /api/jobs/{id} { state: "completed" }` avec le cookie de session et le token CSRF.
5. Redirige vers l'URL de retour encodée dans le paramètre `?appReturn=`.

**JS — blocage de la navigation SPA :** surcharge de `history.pushState` et `history.replaceState` pour confiner l'utilisateur à la route `/tasks/{id}/jobs/{id}`.

**Blocage des pages de gestion CVAT :** règle `location ~` retournant `403` sur toutes les routes de l'interface de gestion CVAT (`/tasks`, `/projects`, `/jobs`, etc.).

## Extensions futures rendues possibles par cette architecture

### Création de labels directement dans le studio annotateur

Nativement dans CVAT, les labels (noms d'espèces) sont définis à la création de la tâche et ne peuvent pas être ajoutés en cours d'annotation depuis l'interface standard. Notre injection NGINX peut résoudre ce problème sans toucher à CVAT :

- Injection d'un panneau latéral flottant permettant à l'annotateur de proposer une nouvelle étiquette.
- Appel à `PATCH /api/tasks/{id}` avec le label supplémentaire dans la payload.
- Rechargement local du sélecteur de labels CVAT via l'API CVAT JS côté client.

Cela répond directement à une contrainte métier (les espèces ne sont pas toutes connues à l'avance) sans aucune modification de CVAT.

### Studio curateur

Le curateur travaille sur des images déjà annotées plusieurs fois. Son studio nécessite :
- l'affichage simultané de toutes les annotations proposées par les différents annotateurs ;
- des contrôles pour fusionner, choisir, ou corriger ;
- une validation finale pour export.

NGINX permet d'injecter une UI custom complète dans le studio CVAT existant, en s'appuyant sur les endpoints CVAT natifs disponibles :

| Endpoint CVAT | Usage curator |
|---|---|
| `GET /api/jobs?task_id={id}` | Récupérer tous les jobs (un par annotateur) |
| `GET /api/jobs/{id}/annotations` | Lire les annotations de chaque annotateur |
| `POST /api/consensus/merges` | Déclencher une fusion automatique par seuil IoU |
| `GET /api/quality/conflicts` | Lister les désaccords entre annotateurs |
| `PUT /api/jobs/{id}/annotations` | Écrire la version validée par le curateur |

Comme pour le bouton de validation, ce studio serait injecté via `sub_filter` sur une route dédiée, sans modifier CVAT.

## Maintenabilité et principes de génie logiciel

### Points forts du découplage actuel

- **Séparation des responsabilités** : toute la logique d'injection est isolée dans `nginx/nginx.conf`. Le frontend ne sait pas comment le studio est intégré — il ouvre simplement une URL. `app-api` ne sait pas que CVAT existe côté UI.
- **CVAT reste une boîte noire** : aucune dépendance vers le code CVAT dans nos sources. Une mise à jour de CVAT (nouvelle version) ne nécessite aucune modification de notre code, sauf si CVAT change le nom de ses classes CSS ou la structure de son DOM.
- **Principe ouvert/fermé** : ajouter un comportement dans le studio = ajouter un `sub_filter`, sans modifier ce qui existe.

### Limite identifiée et dette technique

Le JS injecté est actuellement une chaîne de caractères littérale dans `nginx.conf`. Cela pose des problèmes de maintenabilité à mesure que la logique grossit :

- Pas de coloration syntaxique ni de lint JS.
- Pas de tests unitaires isolés.
- Formatage contraint par la syntaxe NGINX.

**Solution recommandée (à planifier) :** externaliser le JS injecté dans des fichiers statiques servis par NGINX, et remplacer le `sub_filter` inline par une simple balise `<script src="/static/ocean-studio.js">`. Cela permet de versionner, tester et linter le code comme n'importe quel fichier JS du projet, tout en conservant l'approche NGINX.

## Conséquences

| | |
|---|---|
| **Positif** | Zéro modification CVAT. Auth transparente par cookie de session. Injection CSS/JS illimitée. Fondation pour le studio curateur et la création de labels en live. |
| **Négatif** | JS injecté non testable en isolation dans l'état actuel. Fragilité potentielle si CVAT change ses noms de classes CSS internes entre versions. |
| **Dette planifiée** | Externaliser le JS injecté en fichiers statiques versionnés. |