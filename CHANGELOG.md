# Changelog

Toutes les évolutions notables de Findy. Le format suit
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et le projet respecte
le [versionnage sémantique](https://semver.org/lang/fr/).

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
