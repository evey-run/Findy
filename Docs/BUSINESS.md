
**Résumé**
- **Contexte**: App Tracker de finance, local-first, Security first (sans connexion API banque, juste import/export csv), lite et dispo sur tous les OS pc pour l'instant (tauri).
- **But**: application en achat unique à vie — évaluer comment gérer les mises à jour et la distribution multiplateforme.

**Options de modèle de vente**
- **Achat unique + MAJ mineures gratuites**: licence perpétuelle, correctifs et sécurité offerts gratuitement, versions majeures payantes.
- **Achat unique + contrat de maintenance**: frais annuels pour accès aux nouvelles versions et support.
- **Abonnement (licence annuelle / SaaS)**: revenus récurrents, aligné sur mises à jour fréquentes.
- **Freemium / extensions payantes**: base gratuite, fonctionnalités avancées achetées séparément.
- **Open-source / donations**: alternative non commerciale ou hybride.

**Mises à jour — stratégie**
- **Politique de versions**: MAJ mineures (bugs/sécurité) gratuites; MAJ majeures (nouvelles fonctionnalités) via paiement ou accès maintenance.
- **Auto-update**: implémenter un updater cross-platform (ex: Sparkle pour macOS ou l'updater intégré à Tauri/Electron).
- **Contrat maintenance**: proposer abonnement pour support prioritaire et accès aux versions majeures.
- **Compatibilité des données**: prévoir migrations automatiques et test de régression des formats.

**Distribution multiplateforme**
- **macOS**: `.dmg` (ou `.pkg`) signé, notarized par Apple.
- **Windows**: `.exe`/`.msi` signé; option Microsoft Store.
- **Linux**: AppImage, DEB/RPM ou Flatpak selon audience.
- **Outils**: privilégier un framework léger (Tauri) et CI pour builds automatisés.

**Packaging macOS (.dmg) — faisable**
- **Étapes clés**: compiler binaire macOS → codesign (Developer ID) → créer `.dmg` → notarize → staple.
- **Pré-requis**: compte Apple Developer, certificats, identifiants de notarization, secrets CI.
- **Automatisation**: GitHub Actions / GitLab CI pour builds signés+notarized.

**Recommandations**
- **Court terme**: garder achat unique, fournir MAJ mineures gratuites, proposer contrat maintenance payant.
- **Moyen terme**: ajouter option abonnement pour updates/support et automatiser builds multiplateforme.
- **Techniques prioritaires**: implémenter auto-update, configurer CI pour builds macOS signés (.dmg), définir système de licence simple.

**Prochaines étapes**
- **Décision commerciale**: choisir définitivement entre perpétuel vs abonnement.
- **Spike technique**: prototyper pipeline CI qui produit un `.dmg` signé et notarized.
- **Licence**: définir format clé/licence et infra minimale (validation offline/online).
- **MVP**: publier un build macOS signé + updater fonctionnel, puis étendre à Windows/Linux.

**Choix recommandé (contexte: petite app, local-first, sécurité)**
- **Recommandation**: conserver un modèle *achat unique* avec MAJ mineures gratuites, et proposer en option un *contrat de maintenance* annuel pour accès aux versions majeures et support.
- **Raisons**: l'app est simple, local-first et orientée sécurité — un abonnement/SaaS paraît disproportionné; l'achat unique respecte l'esprit du produit et facilite l'adoption.
- **Extensions payantes**: proposer en option des modules (ex: synchronisation cloud chiffrée) ou un service payant distinct pour les utilisateurs voulant multi-appareils.
- **Licence & validation**: gardez une licence simple (clé ou activation hors-ligne), éviter les verifications server-only pour respecter la philosophie local-first.

