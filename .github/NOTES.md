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

## Le Baron (version 2, novembre 2026)
- Jeu de ferme idle entre amis, côté amis seulement (caché côté Romane), toujours visible dans l'Arcade.
  Cahier des charges validé par Naim : Idle Miner (parcelles empilées, monte-charge, charrette,
  contremaîtres, goulots) + marché entre amis, commandes du village, classement.
- Fichier unique `baron.js` : le moteur `BX` en haut (tout l'équilibrage dans `BAL`), puis l'affichage
  (préfixe `b2-`). Écrans : Ferme, Grange (stock, four, recettes), Marché (bougies, offres, réserve
  du village au triple du plancher), Village (commandes toutes les 20 min, classement, titres).
- La ferme est simulée sur le téléphone et sauvegardée dans `baron2_saves` ; hors ligne rattrapé au retour.
  Serveur : `supabase/baron2.sql` (tables et fonctions `baron2_*`, accès uniquement par fonctions avec
  le jeton du joueur, `localStorage.bn2_token`). Les ventes entre joueurs créent un `baron2_credits`
  versé au vendeur à sa prochaine sauvegarde (idempotent grâce à `credit_seen` dans l'état).
- `supabase/baron2_00_suppression_ancien.sql` efface l'ancien Baron (tables/fonctions `baron_*`) : à lancer
  seulement au moment de la mise en ligne de la version 2.
- Confiance entre amis : l'argent et le stock sont calculés sur le téléphone (pas de contrôle anti-triche).
- Sources découpées dans `.github/baron-src/` (moteur, données, styles et dessins, écrans) : `baron.js` = head + engine + part-b + part-c + part-d + tail.
  `fake.js` + `build-demo.py` fabriquent une démo autonome avec un faux serveur et 4 amis fictifs.
- Mis en ligne le 10 nov. 2026 (notification envoyée aux amis). Ensuite : bouton doré « Vendre » sur la grange de l'écran Ferme
  (Naim trouvait la vente pas évidente sur l'onglet Grange).
- Paliers (10 nov.) : avant les champs 4, 7, 10, 13… une somme à réunir puis des travaux (5M/30 min, 5B/2 h, 5T/6 h, 5Q/12 h, puis ×1000/24 h),
  état par ferme dans `f.gate` / `f.gates`. Primes des commandes plafonnées à 5× ta propre production.
- À faire : Naim trouve que l'interface « ne donne pas envie de jouer ». Piste : moins de marron et de texte, décor plus vif,
  retours plus satisfaisants, objectif visible.

- Commandes en course (11 nov.) : les mêmes commandes pour tout le village, générées par le serveur
  (`baron2_orders`, table `baron2_orders`, `supabase/baron2_04_commandes.sql`) ; chacun livre (payé au prix de base),
  la prime va au premier qui termine (`baron2_order_win`). Plus de carton plein. Garde-fou `ord2` contre les anciennes versions.
- Le Destin (15 nov., branche `baron-destin`, PAS en ligne) : lieu « sacré » sur La Place, vœux tout faits payés par les joueurs
  (gel, rayon de soleil, brouillard, coup de vent ; pluie, grande tempête, mer d'huile, saison pressée), exaucés ou refusés par le Destin
  (70 % pour lui, 30 % dans la cagnotte de la Loterie, 10 par jour, protection 1 h contre les vœux néfastes). Serveur :
  `supabase/baron2_27_destin.sql` (à lancer à la mise en ligne ; le lieu n'a pas de maître tant que `baron2_destin.owner_id` est vide).
  Moteur : `BX.setWeather` (effets dans `tmOf`, saisons décalées dans `seasonAt`). À mettre en ligne avec les autres nouveaux lieux.
- Le Laboratoire et la Caravane (15 nov., branche `baron-labo`, partie de `baron-destin`, PAS en ligne) : deux lieux sur La Place.
  Laboratoire : 11 recettes exotiques cachées (table `baron2_recipes`, grilles secrètes côté serveur), grille 3×3 façon Minecraft,
  réponse 🟢 bons ingrédients / 🎯 bonne case (`_baron2_labo_eval`), 30 essais par jour, découvreur seul à cuisiner sauf brevet
  (2 % de la fortune moyenne, puis 5 % de chaque vente pour lui). Chaudron sur le téléphone (`S.lab`, 30 min), stock exotique dans `S.exo`.
  Caravane : produits transformés seulement (recettes, luxe, exotiques), 3 routes (Levant 3 h, Épices 6 h, Soie 10 h), ventes ville par ville,
  pillage / sable / douane, assurance payée par le voyageur, départ par le voyageur ou automatique 3 h après le 1er lot.
  Serveur : `supabase/baron2_28_labo_caravane.sql` (à lancer après le 27 ; `_baron2_credits` et `_baron2_charges` redéfinis).
  Après tests de Naim (15-16 nov.) : le Laboratoire doit passer en MÉLANGE LIBRE (pas d'énigme choisie : on pose ce qu'on veut,
  la forme compte mais pas la position, façon Minecraft ; si raté, 🟢/🎯 par rapport à la recette inconnue la plus proche),
  livre en cartes numérotées (❓), pain perdu connu en exemple, essais illimités, indices = nombre d'ingrédients + un indice
  autonome, « Savoir ce que c'est » (nom du plat) payant. 38 plats connus de tous (pas d'objets) dans `.github/labo-recettes.json`
  (à mettre dans `baron2_recipes` à la place des 11 anciennes) ; villes de la caravane à revoir pour coller aux plats.
  Règle validée : la caravane et ses villes ne demandent/affichent JAMAIS un plat pas encore découvert (déjà le cas : `_baron2_cara_cat` et `exoOf` filtrent `found`) ; à garder pour les nouvelles villes.
  Prototype validé : artefact « Le Laboratoire · essai » (https://claude.ai/artifact/L29tUHTUapQuo97cwkfDib).
  Attribution plus tard : `update baron2_labo set owner_id = '<id>'`, `update baron2_cara set owner_id = '<id>'`.
- CODÉ le 16 nov. 2026 (branche `baron-labo`, PAS en ligne) — `supabase/baron2_29_espions.sql` (à lancer après 27 et 28), baron.js v49 :
  · Laboratoire en MÉLANGE LIBRE ouvert à tous : grille recalée en haut à gauche (`_baron2_labo_norm`, la forme compte, pas la position),
    38 plats de `.github/labo-recettes.json` (les 11 anciennes supprimées), pain perdu `known` (connu de tous, cuisinable par tous).
    `baron2_labo_try(p_token, p_state, p_grid)` (plus de p_k) : découverte → `found_by` + annonce ; recette secrète d'un autre refaite →
    apprise en secret (`baron2_labo_known`), cuisinable sans royalties, la victime n'en sait rien ; raté → 🟢/🎯 (recette inconnue la plus proche)
    SEULEMENT pour le chercheur. Indices des cartes (nb d'ingrédients + indice) seulement pour le chercheur ; « Savoir ce que c'est »
    = `baron2_labo_name` (0,5 % de la fortune moyenne). Brevet : 5 % de la fortune moyenne (min 50B). Livre en cartes n°1-38, essais illimités.
  · Caravane : villes connues de tous (Europe : Bruxelles, Madrid, Rome ; Amériques : New York, La Havane, Rio ; Tour du monde : Londres,
    Moscou, Pékin, Tokyo), chaque plat recherché dans une ville (×1,5), pièce montée partout. Saturation : ×1/(1+0,3×(lots du même produit −1)).
    Avant le départ, les lots des autres sont cachés (« un lot, contenu inconnu »).
  · Réseau d'espions : tables `baron2_spy` (prix par type dans `prices`, 10 gratuits/jour pour le maître) et `baron2_spy_files`.
    Dossiers : argent (argent exact + vraie fortune), grange, paris, caravane (+ nb de lots par produit), bateaux, labo (essais + recettes
    secrètes AVEC grilles : bouton « Poser » dans la grille), commandes (prochain créneau, sans cible). Prix fixés par le maître (Vendre / − / + / ✕),
    payés au maître (`spy_fee`, charges 20 % « Espions »). Le maître voit toujours les commandes du prochain créneau.
  · Classement flou : `baron2_world` arrondit les fortunes à 2 chiffres (`_baron2_round2`) et donne `stats.rk` (ordre exact) ; le client trie par rk
    et affiche « ≈ » devant les fortunes des autres.
  · Testé sur un Postgres local avec tous les fichiers SQL + Playwright (3 joueurs) : aucune erreur de page.
  · Attribution plus tard : `update baron2_spy set owner_id = '<id>', since = now() where id = 1;`
  · Remarque : le Destin ne paie pas de charges (déjà le cas avant, à décider).
  · Ensuite : attribution des 4 lieux (Destin, Laboratoire, Caravane, Espions) — chacun choisit, tirage au sort si deux veulent le même ;
    le Casino reste au Baron ; mise en ligne de tout en même temps (fichiers 27, 28, 29 puis baron.js), seulement avec l'accord de Naim.
  · Refusés par Naim : appels d'offres secrets, nouvelles du village en avance, « grosses positions » (déjà visibles), contre-espionnage.
  · `.github/baron-src/` n'est plus à jour : `baron.js` fait foi.
- LE GRAND CHOIX DES LIEUX (codé le 16 nov. 2026, branche `baron-labo`) — `supabase/baron2_30_grand_choix.sql` :
  · `baron2_choix` : status avant → voeux (le 17 nov. 2026 à 9 h, Paris, au premier appel : les 7 lieux sont repris) → fait.
    Les 7 lieux : casino (la Roulette), port, fly, destin, labo, cara, spy. Helpers `_baron2_lieu_owner` / `_baron2_lieu_set`.
  · Vœux (`baron2_choix_voeux`, les 7 lieux classés), tirage automatique dès que tout le monde a voté, tour par tour, au sort en cas
    de conflit ; ceux qui n'ont pas voté passent en dernier (lieux restants au hasard). Naïm peut lancer le tirage (`baron2_choix_force`,
    id admin en dur : 232590e0-…).
  · La Roulette a son propre patron (`baron2_casino.owner_id`) : `_baron2_croupier()` = le Baron avant le choix, le patron après.
    Le Baron garde le Tribut et son Bureau (prêts). Les charges (20 %) touchent aussi la Roulette et le Destin (le Baron reste exempté).
  · Titres : vente au prix libre (`baron2_lieu_sales`, `baron2_lieu_buy`), échange lieu contre lieu (`baron2_lieu_swaps`, accepter/refuser).
  · Client : bandeau en haut de La Place, page « choix » (vœux / titres / résultat du tirage), « En bref » (résumé) en haut de chaque lieu.
  · `supabase/baron2_26b_rattrapage_prod.sql` : ce qui avait été changé directement en ligne (cad_open, sucre dans commandes/réserve).
  · Ordre de mise en ligne : 27, 28, 29, 30 sur Supabase, puis fusion de `baron-labo` dans `main`.
- Coups de malice (Cartes Chance, Almanach, prête-nom, contrats) : codés sur la branche `baron-malice`, mis de côté par Naim.

## Tests
- Serveur local `python3 -m http.server 8770` dans le dépôt, puis Playwright (Chromium préinstallé)
  avec un faux client Supabase injecté à la place de `supabase.min.js`. Toujours tester côté amis ET côté
  Romane, et vérifier qu'il n'y a aucune erreur de page.

## Préférences de Naim
- Proposer ou prototyper (artefact jouable) avant de mettre en ligne une nouveauté.
- Ne rien casser côté Romane. Ne jamais partager le lien de Romane dans le groupe des amis.
- Donner des liens directs et cliquables avec les étapes.
