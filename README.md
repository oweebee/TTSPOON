# TTSPOON

Fork perso d'EDGE TTS (https://edgetts.github.io/) — interface web pour la synthèse vocale Microsoft Edge, 100% côté client (aucun backend requis, connexion directe en WebSocket à l'API Edge TTS).

## Développement

Sources statiques : `index.html`, `assets/`, dictionnaire français `FR.lexx`.
Tests de régression : `node --test tests/regression.cjs`.
Original : https://github.com/EdgeTTS/EdgeTTS.github.io (branche master).
Les personnalisations françaises sont maintenues séparément : ne pas écraser le site avec l'original.

## Déploiement Coolify

Un `Dockerfile` + `nginx.conf` sont fournis (site statique nginx). Dans Coolify :

1. New Resource → Public/Private Repository → `https://github.com/oweebee/TTSPOON.git`
2. Build pack : **Dockerfile** (détecté automatiquement)
3. Port : `3945`
4. Deploy

## Écran de mot de passe (page de connexion)

L'appli affiche un écran "Mot de passe" avant d'accéder au site, si un mot de passe est configuré. C'est géré par `entrypoint.sh` : au démarrage du conteneur, il lit la variable d'environnement `APP_PASSWORD`, calcule son hash SHA-256, et l'injecte dans `assets/env-config.js`. Le mot de passe en clair ne quitte jamais le serveur — seul le hash est envoyé au navigateur, qui compare localement.

Pour l'activer dans Coolify :

1. Onglet **Environment Variables** de l'application.
2. Ajouter une variable : `APP_PASSWORD` = ton mot de passe (en clair, Coolify le stocke chiffré côté serveur).
3. Save, puis **Redeploy** (le conteneur doit redémarrer pour régénérer le hash).

Si `APP_PASSWORD` n'est pas définie, l'écran de mot de passe est désactivé automatiquement (accès libre).

⚠️ Ce verrou est côté client (JavaScript) : il empêche l'accès occasionnel, mais un utilisateur technique qui ouvre les outils de développement peut le contourner. Ce n'est pas une protection de niveau serveur. Pour une vraie protection, garder aussi le HTTP Basic Authentication de Coolify (Configuration → Network) en plus, ou à la place.
