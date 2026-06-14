
## Principes de sécurité (résumé concis)

- **Philosophie**: l'application est "local-first" — minimiser les dépendances réseau, chiffrer les données locales par défaut et éviter les verifications server-only quand possible.

- **Protéger le code source**:
	- Distribuer des binaires compilés pour macOS/Windows/Linux ; ne pas inclure le code source dans les builds destinés aux clients.
	- Pour le code JS/TS du front-end, minifier et sourcemaps optionnels séparés (ne pas publier les sourcemaps avec les builds de production).
	- Ne pas compter sur l'obscurcissement comme seule protection — privilégier la sécurité des données et la simplicité de licence.

- **Licence / activation**:
	- Utiliser une clé simple liée à un identifiant machine ou email (HMAC signée côté serveur) afin d'autoriser l'activation hors-ligne lorsque possible.
	- Garder la validation hors-ligne possible (produire une clé dérivée) et offrir vérification en ligne facultative pour le support et la révocation.
	- Stocker localement l'état d'activation chiffré (ex: AES-GCM) et garder la logique de décryptage minimale et traçable.

- **Mises à jour mineures sécurisées**:
	- Signer tous les artefacts de mise à jour (binaire / patch) avec une clé privée contrôlée par l'éditeur.
	- L'application vérifie la signature avant installation; refuser tout update non signé.
	- Utiliser HTTPS + certificat valide pour tout point de mise à jour en ligne.
	- Supporter delta updates cryptographiquement vérifiables pour réduire la surface d'attaque.

- **Auto-update / flux**:
	- L'updater télécharge l'artefact, vérifie l'empreinte (SHA256) et la signature, puis installe localement.
	- Prévoir rollback si l'appli ne se lance pas après l'update.

- **Gestion des secrets et signatures**:
	- Ne pas stocker de clés privées dans le repo.
	- Utiliser un coffre (CI secrets / Apple Keychain / HashiCorp Vault) pour signer dans CI.
	- Pour Apple notarization, stocker les identifiants Apple dans secrets CI et automatiser la notarize via actions.

- **Bonnes pratiques complémentaires**:
	- Chiffrer les données sensibles au repos (utiliser libs éprouvées).
	- Auditer les dépendances (Snyk, npm audit, cargo audit si Tauri) avant release.
	- Minimiser les composants réseau par défaut; offrir opt-in pour sync/cloud.
	- Logs: éviter d'écrire des données sensibles en clair.

## Checklist rapide pour release mineure sécurisée

- Compiler artefact de release.
- Signer artefact (clé privée en CI).
- Construire patch/delta si possible.
- Générer et publier manifeste avec SHA256 + signature.
- Lancer notarization (macOS) si applicable.
- Déployer l'artefact sur CDN/serveur HTTPS.
- L'application client vérifie signature + SHA avant application.

