# Mise en ligne de la démonstration / Putting the demonstration online

> **FR.** État au 2026-10-10. **Validation locale uniquement** : ni CI distante, ni revue humaine. Le contenu biomédical n'est pas validé par des experts (la version française est une traduction préparée par une IA, non relue). Ce guide met en ligne une **démonstration avec des données fictives**, pas une application pour de vrais étudiants.
>
> **EN.** State on 2026-10-10. **Local validation only**: no remote CI, no human review. The biomedical content is not validated by experts (the French version is an AI-prepared, unreviewed translation). This guide puts a **demonstration with fictitious data** online, not an application for real students.

---

# Français

## Ce qui est déjà en ligne, et ce qui manque

| Élément | État |
|---|---|
| **Le site (interface)** sur Vercel | Construit et déployé à chaque envoi sur `main`. |
| **L'API (le serveur)** | **Pas encore hébergée.** Vercel ne peut pas l'héberger : elle utilise une base de données SQLite dans un fichier. |
| **Accès public au site** | Bloqué par défaut par l'« authentification Vercel » (les visiteurs sont renvoyés vers une page de connexion Vercel). |

Sans API, le site affiche un message clair (« This build has no API address: VITE_API_URL must be set when the production bundle is built. », ou son équivalent français) et ne démarre pas. Il faut donc 3 réglages que seul le propriétaire des comptes peut faire.

## À savoir avant de rendre l'API publique

L'interface n'a **qu'une entrée : la session invitée de démonstration**. Elle demande à l'API de créer un accès **sans mot de passe** (étudiant, ou enseignant). Le serveur refuse volontairement ce mode en production, sauf si l'on écrit soi-même `ALLOW_DEMO_IN_PRODUCTION=1`. Concrètement, une fois l'API publique :

- **n'importe qui** qui connaît son adresse peut ouvrir la vue étudiant et la vue enseignant (y compris « Approve » dans la relecture du contenu et la réinitialisation des données) ;
- **tous les visiteurs partagent le même étudiant de démonstration** : l'un peut réinitialiser la progression d'un autre ;
- il n'y a que des **données fictives** (38 étudiants générés) : rien de réel n'est exposé, mais rien n'est protégé non plus ;
- des limites connues subsistent (pas de plafond de connexions simultanées, par exemple : voir `docs/KNOWN_LIMITATIONS.md`).

Si ce n'est pas acceptable, ne faites pas l'étape 1 : montrez l'application en local (`docs/FACULTY_DEMO_SCRIPT.md`) et gardez le site Vercel derrière l'authentification.

## Étape 1 : héberger l'API (Render, offre gratuite)

1. Sur https://render.com : **New → Blueprint**, choisissez le dépôt GitHub `loeymot-sketch/escape-lab`. Render lit `render.yaml` à la racine et prépare le service `escape-lab-api` (image Docker de `be/`).
2. Renseignez **`CORS_ORIGIN`** : l'adresse exacte de votre site Vercel **de production**, sans `/` final (Vercel → votre projet → *Domains*), par exemple `https://escape-lab.vercel.app`. Toute autre origine est refusée par le navigateur.
3. Dans le tableau de bord du service, ajoutez la variable **`ALLOW_DEMO_IN_PRODUCTION` = `1`**. C'est le geste volontaire qui accepte le risque ci-dessus : sans lui, l'API refuse de démarrer.
4. Lancez le déploiement. Quand le service est « Live », ouvrez `https://<votre-service>.onrender.com/api/health` : vous devez voir `{"status":"ok","labs":4,"missions":10}`.

Notes : l'API remplit toute seule la base fictive au premier démarrage. Sur l'offre gratuite, le service **s'endort après environ 15 minutes d'inactivité** (le premier chargement suivant dure 30 à 60 secondes) et **la base repart de zéro à chaque redémarrage** : pour une démonstration, c'est plutôt un avantage (données propres). Fly.io ou Railway fonctionnent aussi avec `be/Dockerfile` (mêmes variables).

## Étape 2 : donner l'adresse de l'API au site (Vercel)

1. Vercel → votre projet → **Settings → Environment Variables** : ajoutez **`VITE_API_URL`** = `https://<votre-service>.onrender.com/api` (pour *Production*).
2. **Deployments → … → Redeploy** (la variable est lue à la **construction** : sans nouveau déploiement elle ne change rien).

## Étape 3 : ouvrir le site au public (Vercel)

**Settings → Deployment Protection → Vercel Authentication** : désactivez-la pour *Production* (ou laissez-la active et invitez les relecteurs dans votre équipe Vercel).

## Vérifier

Ouvrez votre site Vercel dans une fenêtre de navigation privée : la page d'accueil se charge, « Poursuivez vos enquêtes » / « Continue your investigations » s'affiche, l'interrupteur **FR | EN** fonctionne, une mission se joue. Si vous voyez « Cannot reach the Escape Lab server » ou une erreur de connexion : vérifiez `CORS_ORIGIN` (orthographe exacte, sans `/` final), que le service Render est réveillé, et que `VITE_API_URL` se termine par `/api`.

## Revenir en arrière

Supprimez le service Render (l'API disparaît, le site affiche son message « pas d'API ») ou retirez `ALLOW_DEMO_IN_PRODUCTION` (l'API refuse alors de redémarrer).

---

# English

## What is online already, and what is missing

| Item | State |
|---|---|
| **The site (interface)** on Vercel | Built and deployed on every push to `main`. |
| **The API (server)** | **Not hosted yet.** Vercel cannot host it: it uses a SQLite database file. |
| **Public access to the site** | Blocked by default by "Vercel Authentication" (visitors are redirected to a Vercel login page). |

Without an API the site shows a clear message ("This build has no API address: VITE_API_URL must be set when the production bundle is built.") and does not start. Three settings, which only the account owner can make, are needed.

## Before making the API public

The interface has **one entry only: the demonstration guest session**. It asks the API to mint an access **without a password** (student or teacher). The server refuses this mode in production on purpose, unless you write `ALLOW_DEMO_IN_PRODUCTION=1` yourself. Once the API is public:

- **anyone** who knows its address can open the student and the teacher views (including "Approve" in content review and the data reset);
- **all visitors share the same demonstration student**: one visitor can reset another's progress;
- only **fictitious data** is served (38 generated students): nothing real is exposed, but nothing is protected either;
- known limits remain (for example no cap on simultaneous connections: see `docs/KNOWN_LIMITATIONS.md`).

If that is not acceptable, skip step 1: show the application locally (`docs/FACULTY_DEMO_SCRIPT.md`) and keep the Vercel site behind authentication.

## Step 1: host the API (Render, free plan)

1. On https://render.com: **New → Blueprint**, pick the GitHub repository `loeymot-sketch/escape-lab`. Render reads `render.yaml` at the root and prepares the `escape-lab-api` service (Docker image of `be/`).
2. Fill in **`CORS_ORIGIN`**: the exact address of your **production** Vercel site, no trailing `/` (Vercel → your project → *Domains*), for example `https://escape-lab.vercel.app`. Browsers refuse any other origin.
3. In the service dashboard add the variable **`ALLOW_DEMO_IN_PRODUCTION` = `1`**. This is the deliberate act that accepts the risk above: without it the API refuses to start.
4. Deploy. When the service is "Live", open `https://<your-service>.onrender.com/api/health`: you should see `{"status":"ok","labs":4,"missions":10}`.

Notes: the API fills the fictitious database by itself on first start. On the free plan the service **sleeps after about 15 minutes without traffic** (the next load takes 30 to 60 seconds) and **the database starts again from scratch at every restart**: for a demonstration that is rather an advantage (clean data). Fly.io or Railway also work with `be/Dockerfile` (same variables).

## Step 2: give the API address to the site (Vercel)

1. Vercel → your project → **Settings → Environment Variables**: add **`VITE_API_URL`** = `https://<your-service>.onrender.com/api` (for *Production*).
2. **Deployments → … → Redeploy** (the variable is read at **build time**: without a new deployment it changes nothing).

## Step 3: open the site to the public (Vercel)

**Settings → Deployment Protection → Vercel Authentication**: turn it off for *Production* (or keep it on and invite the reviewers to your Vercel team).

## Check

Open your Vercel site in a private window: the home page loads, "Continue your investigations" / "Poursuivez vos enquêtes" is shown, the **FR | EN** switch works, a mission can be played. If you see "Cannot reach the Escape Lab server" or a connection error: check `CORS_ORIGIN` (exact spelling, no trailing `/`), that the Render service is awake, and that `VITE_API_URL` ends with `/api`.

## Undo

Delete the Render service (the API disappears; the site shows its "no API" message) or remove `ALLOW_DEMO_IN_PRODUCTION` (the API then refuses to restart).
