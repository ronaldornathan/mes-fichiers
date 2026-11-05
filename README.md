## Le message « introuvable » à la suppression

Le nouveau front appelle une route (`/api/delete`) qui n'existe que dans le nouveau Worker. L'ancien Worker répond « Introuvable ». Dans ce cas l'interface affiche maintenant « Le Worker en ligne n'est pas à jour… » au lieu de ce message vague. Pour corriger :
1. Lance `npx wrangler deploy` dans le dossier du projet.
2. Republie aussi tous les fichiers du front sur GitHub Pages (`index.html`, `css/`, `js/`, `sw.js`), pas seulement `index.html`.

Si l'erreur persiste après le déploiement, dis-moi le message exact.

## Le partage

Dans la barre d'outils, un bouton **Partager** (avec un badge rouge s'il y a des demandes en attente) crée un lien du type `…/#join=CODE`.
- **Lien ou code :** la personne ouvre le lien, ou colle le code (ou le lien entier) dans « J'ai un code d'invitation » sur l'écran de connexion, et donne son prénom.
- **Droits au choix :** lecture seule, lecture + dépôt, ou dépôt seul. Le dépôt seul ne montre même pas le contenu du dossier.
- **Dossier et durée :** le lien porte sur un dossier précis (le dossier courant ou tout l'espace), pour 1 h, 24 h, 7 j, 30 j ou sans limite.
- **Ce qu'un invité ne peut jamais faire :** supprimer, renommer, déplacer, voir la jauge globale, sortir du dossier partagé, ni voir la liste des autres invités. Ses envois n'écrasent jamais un fichier existant : `a.pdf` devient `a (1).pdf`.

**Repartage par un invité :**
- il ne peut pas donner plus de droits que les siens ;
- un lien en lecture seule est créé tout de suite ;
- un lien avec envoi devient une demande que tu vois dans ton panneau, avec la possibilité d'accorder moins que demandé ;
- les liens créés par un invité ne peuvent pas être repartagés à leur tour.

**Ton dernier mot :**
- Tu vois tous les liens, qui les a créés, et la liste des connectés avec un point vert « en ligne ».
- Tu peux révoquer n'importe quel lien : ses liens dérivés et les invités connectés avec tombent aussi.
- Tu peux exclure une personne, et accepter ou refuser les demandes.
- Un invité ne peut révoquer que les liens qu'il a lui-même créés.

## À savoir

- **Délai de révocation.** Les liens sont stockés dans KV, qui peut mettre jusqu'à environ 1 minute à propager une révocation ou une exclusion.
- **Même navigateur que toi.** Il n'y a qu'une session par navigateur : si tu testes un lien d'invitation dans le même navigateur que ta session, il remplace ta connexion. Teste en navigation privée.
- **Quota KV gratuit.** Le plan gratuit limite les écritures et listes par jour. Le badge de demandes ne se met à jour que toutes les 5 minutes, par économie.
- **Pas de nouveau réglage.** Aucune configuration Cloudflare supplémentaire n'est nécessaire, c'est le même KV `RATE_LIMIT`.

Après le déploiement, teste dans l'ordre :
1. une suppression ;
2. un lien en lecture seule ouvert en navigation privée ;
3. une demande d'envoi faite depuis cet invité, que tu acceptes depuis ton compte.