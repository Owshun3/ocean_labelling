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

---

# ADR-007 : Studios custom découplés de cvat-ui (supersède ADR-006 pour les nouveaux studios)

* **Statut :** Accepté
* **Date :** 2026-05-07
* **Supersède partiellement :** ADR-006 (Injection NGINX comme stratégie d'encapsulation du studio CVAT)

## Contexte

ADR-006 a figé l'injection NGINX (`sub_filter` + `nginx/static/ocean-studio.{js,css}`) comme stratégie d'encapsulation du studio CVAT. Cette stratégie a deux limites identifiées à l'usage :

- **Fragilité aux upgrades CVAT** : tout sélecteur CSS et toute structure DOM de cvat-ui peut changer sans préavis entre versions. Le JS injecté patche le DOM à l'aveugle (pas d'accès au state Redux interne).
- **Plafond fonctionnel** : certains besoins métier (overlay multi-annotateur du curator, gestion d'espèces dynamiques avec autocomplete cross-tâches, raccourcis clavier customs) sont quasi-impossibles à implémenter proprement par injection — ils demandent un contrôle complet du rendu.

## Décision

Construire les nouveaux studios (annotation et curation) **en pages Expo natives** dans le frontend, qui consomment directement les endpoints REST publics de CVAT (`/api/jobs/{id}/annotations`, `/api/jobs/{id}/data`, `/api/tasks/{id}`) et les endpoints app-api (`/app-api/species`, `/app-api/curator/*`).

- **Aucune dépendance au DOM, au CSS ou aux composants JS de cvat-ui.** Pas de `sub_filter` sur les routes du nouveau studio. Pas de scraping de classes CSS CVAT. Pas de réutilisation de composants `cvat-ui`.
- **Rendu** : `react-konva` (web-only) pour le canvas image + shapes. La portabilité native n'est pas un objectif (annoter au doigt n'est pas une UX viable).
- **Routage Expo** : `/studio/[taskId]/[jobId]` (annotation), `/curator/studio/[taskId]/[jobId]` (curation).

## Coexistence avec ADR-006

ADR-006 reste en vigueur **uniquement pour le studio CVAT existant** (`/tasks/{id}/jobs/{j}`), qui demeure accessible pendant la phase de transition à des fins de fallback admin et de comparaison. `nginx/static/ocean-studio.{js,css}` continue d'être servi par NGINX et n'est pas refactoré dans le cadre de cet ADR.

Quand le studio custom couvrira fonctionnellement le studio CVAT injecté, ADR-006 sera marqué « Supersédé » et le `sub_filter` retiré.

## Conséquences

| | |
|---|---|
| **Positif** | Découplage total : un upgrade CVAT 2.62 → 2.6X ne casse rien tant que la signature des endpoints REST reste stable (rétro-compat documentée). Contrôle complet de l'UX (raccourcis, undo/redo, overlay multi-annotateur, autocomplete espèces cross-tâches). Style cohérent avec le reste de l'app Ocean (theme, breadcrumb, header). Code testable en isolation (composants React, services axios), versionnable, lintable. |
| **Négatif** | Effort initial significatif : un studio d'annotation représente ~8-10 fichiers et une fois mature, le studio curator demandera autant. On ré-implémente des fonctionnalités CVAT (drag/resize, sauvegarde, raccourcis clavier que les utilisateurs CVAT connaissent déjà). |
| **Risque** | Drift par rapport au comportement de CVAT : nos shapes envoyés via `POST /api/jobs/{id}/annotations` doivent respecter le format exact attendu par CVAT (`type`, `frame`, `points`, `label_id`, `attributes`). Tests d'intégration au curl indispensables avant chaque release. |

## Stratégie hybride pour les espèces (rappel)

Conformément à la décision technique de la session : Postgres est la source de vérité (`species` table), CVAT reçoit le label en miroir lazy au moment du `POST /annotations`. Voir `app-api/src/routes/species.js` et la spec en commentaires de `frontend/src/features/studio/`.

---

# ADR-008 : Authentification par session côté app-api (proposé, à implémenter)

* **Statut :** Proposé (réunion 2026-05-07)
* **Date :** 2026-05-07

## Contexte

Modèle actuel : authentification Token-Bearer DRF côté CVAT, propagée via header `Authorization: Token <key>` à app-api. Le frontend stocke le token CVAT en localStorage. Pas de session serveur côté app-api.

Limitations identifiées en réunion :
- Pas d'invalidation côté serveur : un token compromis reste valide jusqu'à logout explicite (qui dépend de l'utilisateur).
- Pas de TTL contrôlable côté app-api ; on subit la politique CVAT.
- Le localStorage est lisible par tout JS de la page (XSS = vol de token).

## Décision

Migrer vers un modèle de **session serveur** géré par app-api :
- Au login, app-api crée une entrée `app_sessions(id, cvat_user_id, cvat_token, created_at, expires_at, last_seen_at)` côté Postgres et émet un **session ID** (UUID v4) court.
- Le client stocke le session ID dans un cookie `HttpOnly` + `Secure` + `SameSite=Strict`. Le cookie sert UNIQUEMENT à transporter le session ID — aucun crédential réel n'est dans le cookie.
- Toutes les requêtes app-api passent le cookie ; le middleware `requireAuth` lit le cookie → look-up session → enrichit `req.cvatUser`. Le token CVAT est récupéré côté serveur depuis la session pour les proxies CVAT.
- Logout : `DELETE app_sessions WHERE id = ?`. Invalidation immédiate.
- TTL session : 30 jours rolling (renouvelé à chaque requête via `last_seen_at`). Hard expiry après 90 jours d'inactivité absolue.

## Conséquences

| Positif | Négatif |
|---|---|
| Invalidation serveur immédiate possible | État serveur (table sessions) — minor cost |
| Token CVAT jamais exposé au JS frontend (anti-XSS) | Migration significative côté frontend (suppression localStorage, gestion cookie) |
| TTL et révocation contrôlés par nous | Le frontend doit envoyer `credentials: 'include'` partout |
| Audit log naturel (`app_sessions.last_seen_at`) | Login direct CVAT (`/api/auth/login`) reste, mais le token n'est plus exposé au client |

## Migration

À effectuer en une session dédiée. Touche : `CvatAuthService`, `axiosClient` (withCredentials, retire l'intercepteur Token), tous les services API (`AppApiService`, `StudioService`, `SpeciesService`, `ModerationService`, `CuratorService`), backend `middleware/auth.js`, tous les routers (`requireAuth` doit fonctionner sur le cookie), config NGINX (CORS `Access-Control-Allow-Credentials`), table `app_sessions` dans `db.js`.

---

# ADR-009 : Rôles CVAT bas par défaut + rôle applicatif distinct (proposé)

* **Statut :** Proposé (réunion 2026-05-07)
* **Date :** 2026-05-07

## Contexte

CVAT possède son propre système de permissions (organization roles : owner, maintainer, worker, supervisor). Aujourd'hui les utilisateurs Ocean créés via registration héritent du rôle CVAT par défaut, qui peut être trop permissif si CVAT change ses defaults entre versions, ou si on oublie d'ajuster lors de la création.

Risque : un utilisateur Ocean avec rôle applicatif `annotator` pourrait, via accès direct à l'API CVAT (port 8888 ouvert, token valide), exécuter des opérations CVAT-natives élargies (lister toutes les tâches, créer un projet) si son rôle CVAT le lui permet.

## Décision

À l'inscription d'un nouvel utilisateur Ocean, app-api doit **assigner explicitement le rôle CVAT le plus restrictif possible** (typiquement `worker` ou équivalent) en parallèle de l'inscription dans `user_roles`. Le rôle applicatif Ocean (admin/moderator/curator/chercheur/annotator/guest) reste la source de vérité pour les permissions Ocean ; le rôle CVAT bas est une **couche de défense en profondeur** contre les contournements directs.

L'admin Ocean (CVAT_ADMIN_USER) reste superuser CVAT — c'est lui qui pilote l'API admin via app-api.

## Conséquences

| Positif | Négatif |
|---|---|
| Défense en profondeur : un bug app-api n'élargit pas l'accès CVAT | Code d'inscription doit faire un PATCH CVAT supplémentaire pour set le rôle |
| Sépare cleanly « rôle Ocean » de « rôle CVAT » | Si CVAT change le nom du rôle bas, casse silencieuse |
| Cohérent avec ADR-002 (CVAT en boîte noire) — on ne touche pas son code, on utilise son API | — |

## Implémentation

À étudier en session dédiée. Touche : `app-api/src/routes/users.js` (création), endpoint CVAT à confirmer (probablement `PATCH /api/memberships/{id}` après l'inscription). Vérifier le rôle CVAT par défaut actuel via `cvat_db` (table `organizations_membership` ou similaire).

---

# ADR-010 : Modèle espèce multi-noms + tags + description (accepté)

* **Statut :** Accepté (réunion 2026-05-07)
* **Date :** 2026-05-07

## Contexte

Le modèle `species` actuel ne porte qu'un seul champ `name`. La réunion a clarifié qu'une espèce peut être désignée par :
- Son nom scientifique (Latin)
- Son nom d'usage français (ex. « tortue verte »)
- Son nom d'usage polynésien / tahitien (ex. « honu »)

L'annotateur, selon son profil (chercheur scientifique vs amateur local), tape l'un ou l'autre. La recherche doit matcher dans les trois noms.

De plus, le curator a la responsabilité de produire une **description** par espèce (saisie libre, import Wikipédia, ou validation de proposition annotateur), affichée côté guest dans la fiche espèce.

## Décision

Évolution du schéma `species` :
```sql
ALTER TABLE species ADD COLUMN IF NOT EXISTS scientific_name TEXT;
ALTER TABLE species ADD COLUMN IF NOT EXISTS common_name TEXT;       -- renomme l'actuel `name` côté usage
ALTER TABLE species ADD COLUMN IF NOT EXISTS polynesian_name TEXT;
ALTER TABLE species ADD COLUMN IF NOT EXISTS category TEXT;          -- 'terrestrial_fauna' | 'marine_fauna' | ...
ALTER TABLE species ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE species ADD COLUMN IF NOT EXISTS description_source TEXT; -- 'manual' | 'wikipedia' | 'annotator_proposal'
```

Le champ `name` existant migre en `common_name` ; les autres sont rétro-compatibles (NULL par défaut). Un index trigramme ou un index GIN sur la concaténation des trois noms accélère la recherche substring.

Recherche : autocomplete change de `LOWER(name) LIKE 'q%'` (prefix) à `LOWER(scientific_name || ' ' || common_name || ' ' || polynesian_name) LIKE '%q%'` (contains). Affichage UI : « common_name (polynesian_name) — scientific_name ».

Catégories : radio buttons dans la fiche curator (faune terrestre / faune marine / extensible). UI annotateur peut filtrer/regrouper par catégorie plus tard.

## Conséquences

| Positif | Négatif |
|---|---|
| Recherche naturelle peu importe le profil de l'annotateur | Migration des espèces existantes (mapping `name` → `common_name`) |
| Description curated stockée → fiche guest informative | UI curator à construire (édition espèce + import Wikipédia) |
| `category` ouvre la voie à des filtres UI plus tard | Tri/dédoublonnage à anticiper (deux noms scientifiques différents pour la même espèce ?) |

Implémentation à séquencer : (1) migration schéma + adaptation autocomplete backend, (2) UI annotateur multi-noms display, (3) UI curator édition espèce + import Wikipédia, (4) fiche guest publique.