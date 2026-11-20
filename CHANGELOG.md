# Changelog

Toutes les évolutions notables de Findy. Le format suit
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et le projet respecte
le [versionnage sémantique](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

- **Findy sur iPhone et Android.** L'application est désormais compilée pour
  iOS et Android via Tauri 2, à partir de la même base de code. Le téléphone
  n'est pas une deuxième installation : c'est une deuxième fenêtre sur les
  mêmes données, celles qui vivent déjà dans le SQLite de votre ordinateur.
  Rien n'est copié ailleurs, il n'y a toujours pas de compte à créer.
- **Interface tactile complète**, et non une mise en page rétrécie. Le tableau
  de bord de bureau est un cockpit : quatre indicateurs de même poids, deux
  graphiques et trois listes tenus dans une fenêtre de 1280 points. Transposé
  tel quel sur 390 points, il ne reste que dix petits chiffres illisibles, dont
  la moitié hors de l'écran. Chaque écran a donc été repensé pour le doigt :
  un solde en très grand, ce qu'il reste à vivre juste dessous, puis les
  dernières opérations.
  - une **barre d'onglets flottante** — Accueil, Transactions, Analyse,
    Portefeuille, Plus — dont l'onglet actif s'ouvre pour montrer son libellé ;
  - les fenêtres modales deviennent des **feuilles montantes** : elles se
    referment d'un glissement vers le bas, et le bouton retour d'Android les
    ferme au lieu de quitter l'écran ;
  - le tableau à six colonnes des transactions devient une **liste groupée par
    jour**, avec recherche, pastilles de filtre et défilement infini ;
  - les menus « … » qui n'apparaissaient qu'au survol — un geste qui n'existe
    pas au doigt — deviennent des feuilles d'actions, et la ligne entière
    devient la cible ;
  - toutes les cibles font au moins 44 points, les champs 16 pixels (en
    dessous, Safari zoome à la saisie et ne dézoome jamais), et les encoches
    haute et basse sont respectées.
- **Connexion au serveur** au premier lancement : l'application demande
  l'adresse de votre ordinateur, la vérifie avant d'aller plus loin, et la
  retient. Une adresse fautive le dit tout de suite, au lieu d'un écran de
  connexion qui échoue sans raison visible.
- **Accès mobile** dans les réglages de l'application de bureau : un
  interrupteur ouvre le serveur à vos appareils, et la carte affiche ensuite
  les adresses à saisir sur le téléphone, copiables d'un appui. Tant qu'on ne
  le demande pas, le serveur reste ce qu'il a toujours été — un service de la
  boucle locale, invisible du reste du réseau. Le garde-fou du tunnel HTTPS
  reste entier : une requête portant un en-tête de proxy est refusée quoi
  qu'il arrive, et chaque route exige toujours le jeton de session.
- L'application web s'installe depuis Safari et Chrome (manifeste, icônes,
  thème sombre, plein écran).

### Modifié

- Le sidecar Express n'est plus compilé pour les cibles mobiles : sur un
  téléphone il n'y a ni Node, ni Prisma, ni droit de lancer un processus. Sans
  cette séparation, l'application se serait fermée au lancement.
- L'écran de connexion passe à des cibles tactiles et à l'autocomplétion des
  mots de passe du système.
- La boîte de confirmation devient une feuille montante sur mobile, et passe
  au-dessus des autres feuilles — une confirmation demandée depuis un
  formulaire s'affichait jusqu'ici derrière lui.

- **Scripts de lancement iOS et Android** dans Conductor, à côté du web et du
  bureau. Ils démarrent le serveur avec l'accès réseau local activé, de sorte
  qu'un lancement mobile suffit à lui seul — il n'y a pas de second script à
  penser à lancer en parallèle. Ils démarrent le simulateur ou l'émulateur s'il n'y en a pas,
  attendent qu'il accepte réellement une installation, et résolvent eux-mêmes
  `JAVA_HOME`, `ANDROID_HOME` et `NDK_HOME` : un panneau de lancement tourne
  dans un shell non interactif, qui ne lit pas `~/.zshrc` et n'a personne pour
  répondre à « choisissez un simulateur ».

### Corrigé

- Le script Tailwind chargé depuis un CDN dans `index.html` était superflu — la
  feuille de style est compilée localement — et bloquait le premier rendu de
  400 Ko. Il aurait purement et simplement échoué dans une application mobile
  hors connexion.
- Le défilement de la fenêtre suit maintenant la hauteur réellement visible
  (`dvh`) : sur iOS, `100vh` vaut la hauteur *sans* la barre d'adresse, et tout
  écran calé dessus dépassait d'une centaine de pixels.
- La bibliothèque native Android est alignée sur des pages de 16 Ko. Sans cela,
  Android 15 lance l'application en mode de compatibilité, affiche un
  avertissement système à chaque ouverture, et le Play Store refuse la mise en
  ligne. Ses symboles de débogage sont retirés au moment de l'édition de
  liens : l'APK de développement passe de 263 à 135 Mo, taille au-delà de
  laquelle un émulateur un peu chargé refuse simplement de l'installer.
- **Connexion impossible sur iOS** (« Load failed » sur l'écran de choix de
  profil, alors que les profils s'affichaient). Le serveur de développement
  Vite n'autorise par défaut que les origines `http(s)` en `localhost` : la
  webview iOS, servie depuis `tauri://localhost`, voyait sa requête de contrôle
  préalable refusée, donc tout envoi de formulaire. Android y échappait, son
  origine `http://tauri.localhost` correspondant au motif — la panne semblait
  propre à iOS sans l'être vraiment.
- **Les appels d'API partent d'une adresse absolue sur mobile.** L'application
  est servie depuis le protocole d'assets de Tauri, dont l'interception Android
  n'expose pas le corps des requêtes : un formulaire pourtant rempli arrivait
  vide au serveur, qui répondait « champ manquant ». Seules les lectures
  fonctionnaient — le symptôme le plus déroutant possible.

## [0.6.0] — 2026-08-23

### Ajouté

- **Portefeuille redessiné** : les comptes sont groupés par nature — comptes
  courants, épargnes, investissements — et chaque tuile porte le logo du
  compte, son code court et son solde **au centime**, là où il était
  auparavant abrégé en « 12 k€ ».
- Un compte courant s'affiche comme une **vraie carte bancaire** : format
  paysage, couleur du compte, logo, solde et quatre derniers chiffres dessus,
  au même gabarit que les autres tuiles. Les livrets et les comptes
  d'investissement gardent la tuile classique.
- Les logotypes sombres sur fond transparent — celui de Boursorama est en bleu
  nuit, celui de Revolut en noir — sont posés sur une plaque claire : sans elle,
  ils disparaissaient purement et simplement sur la carte. Les logotypes déjà
  clairs restent posés à même la carte.
- **Logotype officiel de la banque** récupéré via Enable Banking et copié dans
  le dossier des images : la carte porte le vrai lettrage de l'établissement au
  lieu d'une icône générique. Les comptes déjà liés le récupèrent à la
  prochaine synchronisation. L'image est stockée localement, l'affichage ne
  dépend d'aucun serveur tiers.
- **La carte prend les couleurs de son logotype.** Les teintes dominantes sont
  extraites du logo officiel — Boursorama donne son magenta, son bleu nuit et
  son cyan, le Crédit Mutuel son bleu et son rouge — et composent des halos
  larges et adoucis sur fond sombre, avec un grain qui évite les marches de
  quantification. Un lettrage monochrome comme celui de Revolut ne donne aucune
  couleur : la carte retombe alors sur celle du compte.
- Toute couleur est ramenée sous un seuil de luminance avant d'être posée : le
  texte blanc reste lisible quelle que soit la teinte de la marque.
- Champ « numéro de carte » sur le compte. Seuls les **quatre derniers
  chiffres** sont enregistrés : coller un numéro complet n'en garde que la fin,
  car le reste ne sert à rien et cette base part dans les sauvegardes.
- **Reste à vivre prévisionnel**, en tête de la carte Budgets du tableau de
  bord : deux nombres et rien d'autre — combien de jours le solde tient au
  rythme observé, et où il atterrit à la fin du mois. Le calcul part du solde du jour,
  déduit les échéances à venir — en rattrapant celles dont la date de
  prochaine occurrence traîne dans le passé — et se plafonne aux budgets
  restants sans jamais les soustraire du solde.
- Un compte peut être exclu du reste à vivre depuis le menu du portefeuille.
  Une banque déclare parfois un livret comme compte courant : sans ce réglage,
  12 000 € d'épargne faisaient annoncer 1 345 € par jour au lieu de 145 €.
  L'application signale d'elle-même un compte qui pèse la majorité du solde
  sans avoir bougé depuis trois mois.
- **Tableau des transactions redessiné autour du commerçant et du jour.** Le
  nom du marchand est extrait du libellé bancaire — « CARTE 09/08/25 MONOPRIX
  LYON 3 CB*0556 » devient « Monoprix Lyon » — et porté par une pastille de
  couleur stable, la même d'une session à l'autre. Le libellé d'origine reste
  accessible en infobulle. Aucun nom de commerçant n'est envoyé à un service
  tiers : la reconnaissance se fait entièrement sur la machine.
- Les lignes sont **groupées par journée**, sous un intitulé discret aux noms
  relatifs — « Aujourd'hui », « Hier ». La colonne date devient inutile et
  disparaît.
- Recherche, catégorie et portefeuille sont **intégrés à l'en-tête du
  tableau**, à la même typographie et à la même hauteur que les intitulés de
  colonnes : la ligne d'ajout et la barre de filtres n'ont plus lieu d'être.
- L'en-tête du tableau est en **verre dépoli** : il reste lisible pendant que
  les lignes défilent dessous, sans les masquer tout à fait.
### Corrigé

- Menu d'un compte : le bouton « Reste à vivre » était imbriqué dans le bouton
  « Lier », rendant les deux actions et les pastilles d'état inutilisables.
- Les libellés de virement interminables sont coupés devant leur première
  référence : « PAIERIE REGIONALE D'AUVERGNE RH PAYE DU MOIS REMU STAGIAIRES
  S22HE L069A80L200PAY08/2026… » débordait de la ligne sans rien apprendre.
- Un compte sans code court n'affiche plus une pastille vide dans les
  transactions : il retombe sur ses initiales.
- Le flou de l'en-tête du tableau ne s'appliquait pas. La carte qui l'entoure
  portait elle aussi un `backdrop-blur`, ce qui en faisait une racine
  d'arrière-plan : le flou de l'en-tête cessait de remplacer ce qu'il
  recouvrait et n'ajoutait qu'un halo par-dessus des lignes restées nettes.
- Chaque cellule d'en-tête portait son propre calque de verre. `backdrop-filter`
  étant rogné à la boîte qui le porte, six calques échantillonnaient six
  voisinages différents et laissaient une couture verticale à chaque frontière
  de colonne.
### Supprimé

- L'IBAN et la barre « Comptes / Solde total » quittent le portefeuille : le
  solde exact figure désormais sur chaque carte, et les coordonnées bancaires
  n'ont pas leur place sur un écran de survol.
- La colonne date, la colonne « Pointé », la ligne d'ajout et la mention
  « Total N transactions » quittent le tableau des transactions.
### Sécurité

- Le « dépensé » d'un budget agrégeait les transactions de **tous** les
  espaces, y compris ceux dont le profil n'est pas membre : les catégories
  étant un catalogue commun, aucun filtre de portée ne s'appliquait.

## [0.5.9] — 2026-08-22

### Ajouté

- Modification contextuelle des transactions sélectionnées et suppression
  conditionnelle (#33, #34).
- Import CSV par compte, depuis le portefeuille (#35).
- La liaison bancaire s'ouvre directement depuis « Nouveau compte » (#41).
- Les catégories par défaut sont créées sur un compte vierge (#36).

### Modifié

- Objectifs : le bouton d'archivage disparaît, et les objectifs atteints
  passent sous les objectifs en cours (#42).

### Supprimé

- Catégories : les mots-clés et le type fixe (#39, #40).

### Corrigé

- Supprimer un compte supprime désormais aussi ses transactions (#48).
- Le portefeuille affiche les sommes exactes (#47).

## [0.5.8] — 2026-08-22

### Sécurité

- La clé privée RSA d'Enable Banking n'est plus affichée en clair dans les
  réglages. Une clé importée ou déjà saisie apparaît masquée, accompagnée d'une
  empreinte SHA-256 courte qui suffit à savoir laquelle est chargée ; un bouton
  « Afficher » la révèle sur demande explicite. Le champ était un simple
  `textarea` : le contenu se retrouvait lisible sur toute capture d'écran de
  cette fenêtre, alors que le token ngrok juste en dessous était masqué.

### Corrigé

- Les réglages n'affichent plus une URL `localhost` comme URL de retour à
  déclarer chez Enable Banking : elle y est refusée, et la proposer à la copie
  envoyait l'utilisateur dans le mur.
- Quand le tunnel HTTPS ne s'ouvre pas, les réglages affichent la cause exacte
  renvoyée par ngrok — session déjà utilisée ailleurs, token refusé, domaine
  occupé — au lieu du conseil au hasard « configurez le token et/ou le
  domaine ». Un bouton « Réessayer maintenant » relance l'ouverture sans avoir
  à ré-enregistrer les identifiants.
- À la liaison d'un compte bancaire, tout l'historique disponible est désormais
  récupéré (souvent un à deux ans), et plus seulement les 90 derniers jours. La
  récupération initiale utilise la stratégie « longest » d'Enable Banking, qui
  remonte jusqu'à l'opération la plus ancienne accessible. Cette fenêtre n'est
  ouverte qu'immédiatement après l'autorisation : passé environ une heure, la
  plupart des banques retombent à 90 jours glissants, d'où l'importance de tout
  récupérer dès la liaison.

## [0.5.7] — 2026-08-21

### Corrigé

- **La chaîne de mise à jour automatique fonctionne enfin.** La release n'est
  plus publiée vide au début du build : elle n'apparaît qu'une fois les deux
  architectures et le manifeste `latest.json` prêts. Pendant les dix minutes de
  compilation, `releases/latest/download/latest.json` répondait 404 à tout le
  monde, et un build raté laissait durablement « latest » sur une release sans
  manifeste — donc aucune mise à jour possible pour personne.
- **L'application démarre sur Mac Intel.** Le moteur Prisma était choisi par
  présence de fichier ; le bundle contenant les deux moteurs, l'arm64 était
  toujours retenu et le sidecar x86_64 ne pouvait pas le charger.
- L'échec d'une mise à jour affiche sa cause réelle. Le plugin Tauri rejette
  avec une chaîne, jamais avec un objet `Error` : le test `err instanceof Error`
  jetait systématiquement le message et le remplaçait par « Erreur lors de la
  mise à jour ».
- Une vérification impossible n'est plus présentée comme « vous utilisez la
  dernière version disponible », et la version installée s'affiche toujours au
  lieu de « Chargement de la version… ».

### Modifié

- L'updater interroge le dépôt sous son nom actuel, avec l'ancien en repli : la
  mise à jour ne dépend plus d'une redirection que GitHub supprimerait si le
  nom d'origine était réenregistré.
- Le module `tauri_plugin_updater` journalise en Trace : le chemin de
  téléchargement et d'installation ne trace qu'en debug, un échec de signature
  ne laissait donc aucune trace exploitable.

### Supprimé

- Le workflow `release.yml`, déclenchable à la main : il publiait un
  `latest.json` pointant sur le DMG au lieu de l'archive de mise à jour, ne
  déclarait qu'Apple Silicon, ne fournissait pas le mot de passe de signature,
  et poussait un tag qui déclenchait le vrai workflow en parallèle — les deux
  écrivant alors un manifeste concurrent.

## [0.5.6] — 2026-08-20

### Sécurité

- **Le tunnel HTTPS ne publie plus que le retour d'autorisation bancaire.**
  Il exposait auparavant l'intégralité de l'API — comptes, transactions,
  dettes, sauvegarde — sans authentification, à qui connaissait l'URL. Seuls
  `/api/enablebanking/callback` et `/api/enablebanking/select-account` restent
  atteignables depuis l'extérieur ; tout le reste répond 404.
- **L'API est authentifiée.** Jeton de session signé (HMAC-SHA256, secret
  stocké à côté de la base, validité 30 jours) exigé sur toutes les routes,
  hors écran de connexion et retour bancaire.
- **La portée des données est vérifiée côté serveur.** Elle est bornée par les
  espaces du profil connecté ; un `spaceId` envoyé par le client ne peut plus
  que restreindre cette liste, jamais l'élargir. Contrôles d'appartenance
  ajoutés sur la modification et la suppression d'espace, et sur le changement
  de mot de passe.
- **Le serveur n'écoute plus que sur `127.0.0.1`**, et n'est donc plus
  joignable depuis le réseau local.
- `GET /api/auth/session/:id` supprimée : elle restaurait la session de
  n'importe quel profil à partir de son seul identifiant. Remplacée par
  `GET /api/auth/session`, résolue depuis le jeton.
- Les identifiants de synchronisation quittent le bundle de l'application pour
  le dossier de données, en permissions `0600`. Écrits dans `Resources/`, ils
  ne pouvaient pas être enregistrés une fois l'app installée dans
  `/Applications`, et restaient lisibles par les autres comptes de la machine.
- Les envois d'avatars et la restauration de médias ne peuvent plus écrire hors
  du dossier `uploads/` (traversée de chemin).
- CORS restreint à l'origine du tunnel réellement ouvert par ce serveur.

### Ajouté

- Renouvellement du consentement bancaire en un clic depuis la carte du
  compte, sans repasser par la recherche de banque. Le consentement échu
  bascule automatiquement en « expiré ».
- Import d'un fichier `.pem` pour la clé privée Enable Banking, à côté de la
  saisie manuelle. Clé publique, clé chiffrée ou fichier non conforme sont
  refusés à l'import plutôt qu'à la première synchronisation.
- Cause précise en cas d'échec du tunnel ngrok : session déjà utilisée ailleurs,
  token refusé, domaine occupé ou inexistant. Une session encore occupée après
  fermeture est réessayée automatiquement.
- Journal du serveur écrit dans le dossier de données (`server.log`, archivé
  au-delà de 5 Mo). La sortie du sidecar était jusqu'ici jetée : aucune erreur
  de l'application packagée n'était récupérable.
- Vérification, avant d'envoyer l'utilisateur chez sa banque, que l'URL de
  retour est bien déclarée dans l'application Enable Banking. L'échec se
  produisait auparavant après l'authentification, sans message exploitable.
- Diagnostic détaillé quand Enable Banking autorise une connexion sans
  renvoyer de compte (cause la plus fréquente : application en mode restreint),
  avec le payload brut consultable sur la page de retour et dans
  `enablebanking-debug.json`.
- Vue « flux cumulé » sur le tableau de bord, avec aperçu de la valeur au
  survol.

### Modifié

- Le tunnel ngrok ne s'ouvre que pendant la liaison bancaire et se referme
  après 15 minutes d'inactivité, à condition qu'un domaine réservé garantisse
  une URL stable. Sans domaine réservé, il reste ouvert comme avant. La
  synchronisation, qui n'émet que des appels sortants, n'en dépend pas.
- Le « Moi » de l'application est le profil connecté ; il n'est plus
  sélectionnable manuellement depuis le portefeuille.
- Relecture de la session Enable Banking (jusqu'à trois tentatives) quand la
  banque n'a pas encore publié la liste des comptes.

### Corrigé

- Les indicateurs du portefeuille (nombre de comptes, solde total) étaient
  écrasés jusqu'à devenir invisibles lorsque la grille de comptes débordait.
- Application packagée : le serveur choisit un port libre si le port habituel
  est déjà pris, le frontend le découvre au démarrage, et un serveur orphelin
  d'un lancement précédent est arrêté au lieu de bloquer le port et la base.
- Un portefeuille partagé n'affiche plus votre propre nom dans la liste de ses
  propriétaires.

### Supprimé

- Code mort : `server/src/index-simple.ts` (1703 lignes),
  `server/src/routes/users-simple.ts`, `server/src/routes/recurrences.ts.bak`.

### Tests

- Couverture de la logique critique jusqu'ici non testée : normalisation et
  déduplication des opérations bancaires, réconciliation PENDING → BOOK, calcul
  des soldes (dont les comptes d'investissement), solde des tricounts, jetons
  de session, surface publique du tunnel. `npm run test:server` exécute
  désormais l'ensemble des fichiers de test.

## [0.5.5] — 2026-08-14

- Connexion par profil, espaces partagés et corrections de l'application
  packagée.

## [0.5.0] — 2026-07-21

- Tricount : dettes partagées, utilisateur « Moi », corrections sur les
  transactions et l'expérience utilisateur.

## [0.4.5] — 2026-07-18

- Synchronisation bancaire PSD2 via Enable Banking.
- Mise à jour automatique de l'application (signature et publication GitHub).

## [0.4.0] — 2026-07-17

- Refonte de la page Catégories, renommage « banque » → « portefeuille ».

## [0.3.0] — 2026-07-15

- Investissements : crypto, actions et ETF avec cours en temps réel.

## [0.2.0] — 2026-07-15

- Budgets, objectifs d'épargne et récurrences.

## [0.1.0]

- Première version : transactions, comptes, catégories, import CSV.
