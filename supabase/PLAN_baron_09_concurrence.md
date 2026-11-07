# Le Baron — plan de la mise à jour 9 : concurrence, étals et appli plus claire

Validé par Naïm le 7 novembre 2026. À coder sur la branche `baron-concurrence`.
**Ne rien mettre en ligne (fusion dans main ou SQL appliqué sur la base) sans son accord explicite** :
montrer d'abord des captures d'écran dans la conversation.

## Où on en est
- Jeu : `baron.js` (s'ouvre depuis l'Arcade de Querida). Base Supabase : projet `hslnyzbpuhmqekjbusrl`.
- Mises à jour déjà appliquées sur la base : `baron.sql`, `baron_03` à `baron_08` (dossier `supabase/`).
- La 08 a mis un rythme plus lent (bêtes 60 pièces puis +20 %, paliers ×1,5 / ×2 / ×3, le stock du marché fond de 40 %/h)
  et a relancé une partie le 7 nov. (joueurs et spécialités gardés).
- 4 joueurs : Naïm (blé), Clément (œufs), Hugo (bois), laure (laine). 6 places au total.
- Toute la logique est côté serveur (fonctions `baron_*`, `security definer`, appelées avec le jeton du joueur).
- GitHub a déjà bloqué Querida une fois : regrouper les commits, éviter les pushs à répétition.

## 1. Concurrence : fermes en plus
- Chaque joueur peut ouvrir une 2ᵉ ferme d'un autre produit que sa spécialité : 5 000 pièces.
  Une 3ᵉ ferme plus tard, beaucoup plus chère (environ 50 000).
- Une ferme en plus produit 60 % de ce que produit le spécialiste (même nombre de bêtes).
  Le spécialiste garde l'avantage.
- Chaque ferme a ses bêtes, sa jauge, sa récolte (« Tout récolter » ramasse tout). Les améliorations restent
  liées à la ferme de spécialité (déjà le cas en base : jointure sur `specialty`).
- `baron_farms` accepte déjà plusieurs fermes par joueur. Il faut des fonctions pour ouvrir une ferme et acheter
  une bête dans une ferme précise (`baron_buy_unit` prend aujourd'hui la ferme de spécialité).

## 2. Étals entre joueurs (prix libres)
- Nouvelle table d'offres : vendeur, produit, quantité, prix unitaire, date. Les produits mis en vente
  quittent le stock du vendeur (avec leur date de péremption ; une offre d'œufs ou de lait périmés disparaît).
- Acheter : on voit tous les vendeurs d'un produit, du moins cher au plus cher, et on achète à l'un d'eux.
  Les pièces vont au vendeur.
- « Mon étal » : mettre en vente (quantité + prix), changer le prix, retirer.
- On n'achète plus au village. On achète seulement aux joueurs.

## 3. Le village rachète (et passe les commandes)
- Vente rapide au village, à un prix qui suit la demande : il baisse quand beaucoup de gens lui vendent
  le même produit, puis il remonte avec le temps. Garder le principe du stock qui fond (08).
  Plus de rupture ni d'achat au village.
- Le « Bel étal » augmente toujours le pourcentage de la vente au village.
- Les commandes du village restent comme aujourd'hui (plusieurs produits, grosses primes, Réputation).
- Pourquoi acheter aux autres : revendre plus cher (au village ou sur son étal), remplir les commandes,
  payer les améliorations (chacune se paie avec le produit d'un autre joueur).

## 4. Appli plus claire (Naïm la trouve brouillonne)
- Barre de 4 onglets en bas : Ferme · Marché · Village · Classement.
- Ferme : la scène (taper, corvées), la jauge, « Tout récolter », deux boutons : « Agrandir »
  (bête suivante + prix) et « Améliorer » (fenêtre avec les 6 améliorations). L'objectif devient une petite bannière.
  Les fermes en plus apparaissent comme des onglets ou des pastilles dans la Ferme.
- Marché : la liste des produits (prix le moins cher, nombre de vendeurs, prix de rachat du village).
  Toucher un produit montre ses vendeurs. Plus bas : « Mon stock » (vendre au village ou mettre en vente)
  et « Mon étal ».
- Village : toutes les fermes du groupe (qui produit quoi, combien de bêtes, ce qui est en vente). Demande déjà faite par Naïm.
- Classement : comme aujourd'hui, en plus clair.
- Style : épuré, peu de texte, gros boutons, une seule action principale par écran.

## Étapes
1. SQL `supabase/baron_09_concurrence.sql` (ne rien supprimer d'utile, migrer proprement).
2. Refonte de `baron.js`.
3. Captures d'écran sur téléphone (Playwright, en simulant les réponses du serveur) → les montrer à Naïm.
4. Avec son accord : appliquer le SQL, puis fusionner dans main.
