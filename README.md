# TTSPOON

Fork perso d'EDGE TTS (https://edgetts.github.io/) — interface web pour la synthèse vocale Microsoft Edge, 100% côté client (aucun backend requis, connexion directe en WebSocket à l'API Edge TTS).

## Fichiers manquants à ajouter avant de push (optionnels)

- `RU.lexx` — dictionnaire de remplacement russe (~900 Ko). Télécharge-le depuis https://edgetts.github.io/RU.lexx et place-le à la racine du repo si tu veux garder cette fonctionnalité.
- `assets/logo.png` — favicon. Récupère-le depuis https://edgetts.github.io/assets/logo.png si tu veux garder l'icône d'origine.

Sans ces deux fichiers, le site fonctionne normalement (juste pas de favicon perso, et le lien "Dictionnaire" sera cassé tant que RU.lexx n'est pas ajouté).

## Pousser vers ton GitHub

```bash
cd "EdgeTTS.github.io"   # ce dossier
git init
git add .
git commit -m "Initial import from EdgeTTS"
git branch -M main
git remote add origin https://github.com/oweebee/TTSPOON.git
git push -u origin main
```

## Déploiement Coolify

Un `Dockerfile` + `nginx.conf` sont fournis (site statique nginx). Dans Coolify :

1. New Resource → Public/Private Repository → `https://github.com/oweebee/TTSPOON.git`
2. Build pack : **Dockerfile** (détecté automatiquement)
3. Port : `80`
4. Deploy

Pas de variables d'environnement ni de base de données nécessaires.
