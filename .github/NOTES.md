# Querida : note de reprise (pour Claude)

Note de travail pour reprendre le projet dans une nouvelle conversation. Elle n'est pas publiée sur le site
(le dossier `.github` est exclu par `publier.yml`). Les liens secrets (lien de Romane, lien administrateur)
ne sont volontairement pas écrits ici : les demander à Naim.

## Le projet
- Appli cadeau (PWA) pour Romane, partie en Espagne du 15/10/2026 au 15/07/2027. Les amis déposent des
  « capsules » (mot, photo, vidéo, vocal, chanson) qu'elle découvre au fil du voyage.
- Site : https://lambda123k.github.io/querida/ (dépôt lambda123k/querida, branche main).
- Publication : `.github/workflows/publier.yml` à chaque push (GitHub Actions → Pages). Vérifier avec
  `gh api repos/lambda123k/querida/actions/runs`.
- Données : Supabase, projet `hslnyzbpuhmqekjbusrl` (tables `capsules`, `journal`, `push_subs` ; bucket
  `capsules` utilisé aussi comme mini base de fichiers : `arcade/<jeu>/`, `reactions/`, `comments/`,
  `capreact/`, `moderation/`). Ne jamais partager la clé secrète Supabase ni la clé privée VAPID.
- Côté amis : `?pour=amis` remet un téléphone côté amis.

## Architecture
- `index.html` : l'appli. Expose le pont `window.QUERIDA` (role, me, demo, store, render, clearLayers,
  layerCount, goTab, push, plan, now, dates, openMyCapsule…).
- Fichiers à part, chargés depuis index.html avec un numéro de version (`?v=`) à incrémenter à chaque
  modification : admin.js, enigme.js (amis), arcade.js, chrono.js, marathon.js, feuvert.js, grade.js,
  reactions.js, jeux.js, hub.js, colis.js. Chaque fichier est enveloppé dans try/catch : une erreur ne
  casse jamais l'appli.
- Piège déjà rencontré deux fois : ne jamais nommer une constante `CSS` (masque `CSS.escape`).
- `CONFIG.LIBRES` (index.html) : auteurs dont Romane peut ouvrir tout de suite et supprimer les capsules
  (ajouté après sa rupture, pour les capsules de Clément).

## L'Arcade (hub.js) et les jeux cachés
| Jeu | Fichier | Cachette |
|---|---|---|
| La Tour | arcade.js | cloche sonnée plusieurs fois (amis) / équivalent Romane |
| Le Chrono | chrono.js | doigt maintenu sur le compteur de jours |
| Le Marathon | marathon.js | 10 tapes rapides sur le nombre de capsules (amis) ou le compteur de jours (Romane) |
| Le Feu vert | feuvert.js | 3 tapes sur l'onglet Carnet quand on y est déjà |
| L'Œil | jeux.js | 3 tapes sur le grand titre |
| Les Différences | jeux.js | 3 tapes sur l'onglet de l'accueil quand on y est |
| La Mémoire des chiffres | jeux.js | 3 tapes sur la petite ligne au-dessus du titre |
| L'Accord | jeux.js | 3 tapes sur le soleil de « Comment ça marche » |
| Les Tours de Hanoï | jeux.js | 3 tapes sur le titre « Arcade » |
| Le Savant | jeux.js + savant-q.js | 3 tapes sur le radar de « Mon profil » |

- Un nouveau jeu doit être ajouté : dans jeux.js (module + `triple(...)` + inscription `QUERIDA_GAMES`),
  dans hub.js (`CATALOG`, `M`, éventuellement `SKILLS`), dans grade.js (`GAMES`, classement général),
  dans admin.js (`GAMES`), puis incrémenter les `?v=` dans index.html.
- Les Tours de Hanoï : course de 4 tours (3 à 6 disques), 3 vies, bonus coups parfaits ; classement au
  temps dans `arcade/hanoi2/<ms>__…`.
- Le Savant : série de bonnes réponses, 20 s par question, niveaux 1 à 4 (échauffement 1-3, moyen 4-10,
  difficile 11-20, expert 21+), départage au temps ; `arcade/savant/<série>__<ms>__…`.
  Banque : `savant-q.js`, format `[thème, niveau, question, bonne, mauvaise×3]`, thèmes H G S N A C P L.
  260 questions en octobre 2026 ; objectif 600 à 800, sans questions qui se périment.
- Profil (« Mon profil ») : 8 domaines dont Planification (Hanoï) et Culture générale (Savant).

## Tests
- Serveur local `python3 -m http.server 8770` dans le dépôt, puis Playwright (Chromium préinstallé)
  avec un faux client Supabase injecté à la place de `supabase.min.js`. Toujours tester côté amis ET côté
  Romane, et vérifier qu'il n'y a aucune erreur de page.

## Préférences de Naim
- Proposer ou prototyper (artefact jouable) avant de mettre en ligne une nouveauté.
- Ne rien casser côté Romane. Ne jamais partager le lien de Romane dans le groupe des amis.
- Donner des liens directs et cliquables avec les étapes.
