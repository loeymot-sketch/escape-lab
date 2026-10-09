# Mise en ligne de la démonstration / Putting the demonstration online

> **FR.** État au 2026-10-10. **Validation locale uniquement** : ni CI distante, ni revue humaine. Le contenu biomédical n'est pas validé par des experts (la version française est une traduction préparée par une IA, non relue). Ce guide met en ligne une **démonstration avec des données fictives**, pas une application pour de vrais étudiants.
>
> **EN.** State on 2026-10-10. **Local validation only**: no remote CI, no human review. The biomedical content is not validated by experts (the French version is an AI-prepared, unreviewed translation). This guide puts a **demonstration with fictitious data** online, not an application for real students.

---

# Français

## Deux morceaux à héberger

| Morceau | Rôle | Où |
|---|---|---|
| **`web/`**, le site (interface) | Ce que voit le visiteur. | Vercel. |
| **`be/`**, l'API (serveur) | Calcule scores, chronomètres, indices ; garde la base SQLite. | **Option A** : Vercel aussi, comme second « service » (recommandé). **Option B** : Render. |

## À savoir avant de rendre l'API publique

L'interface n'a **qu'une entrée : la session invitée de démonstration**. Elle demande à l'API de créer un accès **sans mot de passe** (étudiant, ou enseignant). Le serveur refuse volontairement ce mode en production, sauf si l'on écrit soi-même `ALLOW_DEMO_IN_PRODUCTION=1`. Une fois l'API publique :

- **n'importe qui** qui connaît l'adresse du site peut ouvrir la vue étudiant et la vue enseignant (y compris « Approve » dans la relecture du contenu et la réinitialisation des données) ;
- **tous les visiteurs partagent le même étudiant de démonstration** : l'un peut réinitialiser la progression d'un autre ;
- il n'y a que des **données fictives** (38 étudiants générés) : rien de réel n'est exposé, mais rien n'est protégé non plus ;
- des limites connues subsistent (par exemple aucun plafond de connexions simultanées : voir `docs/KNOWN_LIMITATIONS.md`).

Si ce n'est pas acceptable, ne mettez pas l'API en ligne : montrez l'application en local (`docs/FACULTY_DEMO_SCRIPT.md`) et gardez le site derrière l'authentification Vercel.

## Option A : tout sur Vercel (un seul domaine, deux services)

Le fichier **`vercel.json`** (à la racine du dépôt) déclare deux services : `web` (le site, compilé avec `VITE_API_URL=/api`) et `be` (l'API, une image Docker `be/Dockerfile.vercel`). Les adresses `/api/...` vont à l'API **sans changer de chemin** ; tout le reste va au site. Comme tout est sur le même domaine, il n'y a plus de problème d'origines croisées et plus d'adresse d'API à recopier.

1. **Vercel → votre projet → Settings → General → Root Directory** : laissez vide (la racine du dépôt, pas `web`). C'est ce qui fait lire le `vercel.json` de la racine.
2. **Settings → Environment Variables** (pour *Production*), trois variables à créer :
   - `AUTH_SECRET` : un secret d'au moins 32 caractères. Générez-le avec `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `CORS_ORIGIN` : l'adresse exacte de votre site de production, sans `/` final (*Domains*), par exemple `https://escape-lab.vercel.app`.
   - `ALLOW_DEMO_IN_PRODUCTION` = `1` : le geste volontaire qui accepte le risque ci-dessus. Sans lui l'API refuse de démarrer.
3. **Settings → Deployment Protection → Vercel Authentication** : désactivez-la pour *Production* (ou laissez-la et invitez les relecteurs dans votre équipe Vercel).
4. **Redeploy**. Ouvrez `https://<votre-site>/api/health` : `{"status":"ok","labs":4,"missions":10}`.

Limites de l'option A (la fonction « Services » et le « Container Runtime » de Vercel sont en **bêta**) :
- Le disque est **éphémère** : la base fictive est reconstruite (environ une demi-seconde) à chaque démarrage d'instance, et **l'instance s'arrête après 5 minutes sans trafic**. Conséquence : après une pause de plus de 5 minutes, les données de démonstration repartent de zéro et une mission en cours est perdue.
- Si Vercel lance deux instances en parallèle, elles ont **chacune leur base** : sous forte affluence, une session pourrait tomber sur une base sans sa tentative. Pour un présentateur seul, c'est peu probable ; pour du public, utilisez l'option B.
- L'image s'exécute en `root` dans le conteneur isolé de Vercel (le port 80 ne peut pas être ouvert par un utilisateur ordinaire).
- Les limites de débit sont comptées **par instance**.
- Je n'ai pas pu tester le déploiement chez Vercel (compte non accessible depuis ma session) : j'ai testé la même logique en local (même démarrage, même routage `/api` → API et le reste → site, session invitée et enseignant, français par défaut, aucune erreur dans le navigateur). `vercel dev -L` demande Docker.

## Option B : l'API sur Render, le site sur Vercel

Voir `render.yaml` (offre gratuite, image `be/Dockerfile`). Sur Render : **New → Blueprint**, dépôt GitHub ; renseignez `CORS_ORIGIN` (l'adresse exacte du site Vercel) ; ajoutez `ALLOW_DEMO_IN_PRODUCTION=1` ; vérifiez `https://<service>.onrender.com/api/health`. Sur Vercel, gardez **Root Directory = `web`**, ajoutez la variable `VITE_API_URL` = `https://<service>.onrender.com/api` (lue à la **construction** : redéployez), puis désactivez l'authentification Vercel comme ci-dessus. L'offre gratuite de Render s'endort après 15 minutes (premier chargement : 30 à 60 secondes) et repart d'une base neuve à chaque redémarrage. Fly.io ou Railway fonctionnent aussi avec `be/Dockerfile`.

## Vérifier

Ouvrez le site dans une fenêtre de navigation privée : la page d'accueil se charge, « Poursuivez vos enquêtes » (ou « Continue your investigations ») s'affiche, l'interrupteur **FR | EN** fonctionne, une mission se joue. Si vous voyez « Cannot reach the Escape Lab server » : l'API n'est pas démarrée ou l'option B est mal réglée (`CORS_ORIGIN`, `VITE_API_URL` terminé par `/api`). Si l'API ne démarre pas : lisez ses journaux ; un message « DEMO_MODE=1 … refused in production » veut dire qu'`ALLOW_DEMO_IN_PRODUCTION` manque, « AUTH_SECRET » qu'il est absent ou trop court, « CORS_ORIGIN » qu'il manque.

## Revenir en arrière

Retirez `ALLOW_DEMO_IN_PRODUCTION` (l'API refuse de redémarrer) ou supprimez `vercel.json` et remettez *Root Directory* sur `web` (le site seul, sans API : il affiche son message « pas d'API »).

---

# English

## Two pieces to host

| Piece | Role | Where |
|---|---|---|
| **`web/`**, the site (interface) | What the visitor sees. | Vercel. |
| **`be/`**, the API (server) | Computes scores, timers, hints; keeps the SQLite database. | **Option A**: Vercel too, as a second "service" (recommended). **Option B**: Render. |

## Before making the API public

The interface has **one entry only: the demonstration guest session**. It asks the API to mint an access **without a password** (student or teacher). The server refuses this mode in production on purpose, unless you write `ALLOW_DEMO_IN_PRODUCTION=1` yourself. Once the API is public:

- **anyone** who knows the site address can open the student and the teacher views (including "Approve" in content review and the data reset);
- **all visitors share the same demonstration student**: one visitor can reset another's progress;
- only **fictitious data** is served (38 generated students): nothing real is exposed, but nothing is protected either;
- known limits remain (for example no cap on simultaneous connections: see `docs/KNOWN_LIMITATIONS.md`).

If that is not acceptable, do not put the API online: show the application locally (`docs/FACULTY_DEMO_SCRIPT.md`) and keep the site behind Vercel authentication.

## Option A: everything on Vercel (one domain, two services)

**`vercel.json`** (at the repository root) declares two services: `web` (the site, built with `VITE_API_URL=/api`) and `be` (the API, a Docker image `be/Dockerfile.vercel`). `/api/...` goes to the API **with its path unchanged**; everything else goes to the site. Everything being on one domain, there is no cross-origin problem and no API address to copy.

1. **Vercel → your project → Settings → General → Root Directory**: leave it empty (the repository root, not `web`). That is what makes Vercel read the root `vercel.json`.
2. **Settings → Environment Variables** (for *Production*), create three variables:
   - `AUTH_SECRET`: a secret of at least 32 characters. Generate it with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `CORS_ORIGIN`: the exact address of your production site, no trailing `/` (*Domains*), for example `https://escape-lab.vercel.app`.
   - `ALLOW_DEMO_IN_PRODUCTION` = `1`: the deliberate act that accepts the risk above. Without it the API refuses to start.
3. **Settings → Deployment Protection → Vercel Authentication**: turn it off for *Production* (or keep it and invite the reviewers to your Vercel team).
4. **Redeploy**. Open `https://<your-site>/api/health`: `{"status":"ok","labs":4,"missions":10}`.

Limits of option A (Vercel's "Services" and "Container Runtime" are **beta**):
- The disk is **ephemeral**: the fictitious database is rebuilt (about half a second) every time an instance starts, and **the instance stops after 5 minutes without traffic**. So after a pause longer than 5 minutes the demonstration data starts from scratch and a mission in progress is lost.
- If Vercel runs two instances in parallel they **each have their own database**: under heavy traffic a session could land on a database that does not hold its attempt. Unlikely for a single presenter; for an audience use option B.
- The image runs as `root` inside Vercel's isolated container (port 80 cannot be opened by an ordinary user).
- Rate limits are counted **per instance**.
- I could not test the deployment at Vercel (the account is not reachable from my session): I tested the same logic locally (same start-up, same routing `/api` → API and the rest → site, student and teacher guest, French by default, no browser error). `vercel dev -L` needs Docker.

## Option B: API on Render, site on Vercel

See `render.yaml` (free plan, image `be/Dockerfile`). On Render: **New → Blueprint**, GitHub repository; fill in `CORS_ORIGIN` (the exact Vercel site address); add `ALLOW_DEMO_IN_PRODUCTION=1`; check `https://<service>.onrender.com/api/health`. On Vercel keep **Root Directory = `web`**, add the variable `VITE_API_URL` = `https://<service>.onrender.com/api` (read at **build time**: redeploy), then turn off Vercel authentication as above. Render's free plan sleeps after 15 minutes (first load: 30 to 60 seconds) and starts from a fresh database at every restart. Fly.io or Railway also work with `be/Dockerfile`.

## Check

Open the site in a private window: the home page loads, "Continue your investigations" (or "Poursuivez vos enquêtes") is shown, the **FR | EN** switch works, a mission can be played. If you see "Cannot reach the Escape Lab server": the API is not running, or option B is misconfigured (`CORS_ORIGIN`, `VITE_API_URL` ending with `/api`). If the API does not start: read its logs; a "DEMO_MODE=1 … refused in production" message means `ALLOW_DEMO_IN_PRODUCTION` is missing, "AUTH_SECRET" that it is absent or too short, "CORS_ORIGIN" that it is missing.

## Undo

Remove `ALLOW_DEMO_IN_PRODUCTION` (the API refuses to restart) or delete `vercel.json` and set *Root Directory* back to `web` (the site alone, without an API: it shows its "no API address" message).
