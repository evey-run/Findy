# Findy mobile — iOS et Android

Findy tourne sur téléphone via **Tauri 2**, avec la même base de code React que
l'application de bureau. Ce document décrit ce qui change entre les deux, et
comment développer, lancer et publier la version mobile.

---

## 1. Ce qui change par rapport au bureau

| | macOS | iOS / Android |
|---|---|---|
| Serveur | sidecar Express + Prisma lancé par l'application | **aucun** — l'API est distante |
| Base de données | SQLite locale dans `Application Support` | celle du serveur visé |
| Interface | `src/components/*` (barre latérale, tableaux) | `src/mobile/*` (onglets, feuilles) |
| Mises à jour | greffon `updater` | App Store / Play Store |

Sur iOS et Android il n'y a ni Node, ni Prisma, ni droit de `fork`/`exec` : le
sidecar ne peut pas exister. Tout le module est compilé hors des cibles mobiles
(`#[cfg(desktop)] mod sidecar` dans `src-tauri/src/lib.rs`), et l'application
demande à la place l'adresse d'un serveur Findy au premier lancement.

### Quel serveur ?

Deux scénarios, tous deux couverts par le même écran de connexion :

1. **Le Mac de l'utilisateur, sur le réseau local.** Findy est une application
   locale : c'est le scénario naturel. L'accès mobile doit alors être activé
   côté bureau (cf. §4).
2. **Un déploiement** (Vercel, VPS…). L'adresse est alors en `https://` et peut
   être figée à la compilation avec `FINDY_API_BASE`.

L'adresse est enregistrée dans `localStorage` sous `findy-server-url` et
résolue au démarrage par `src/lib/apiBase.ts`.

---

## 2. Prérequis

```bash
# Cibles Rust
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
rustup target add aarch64-linux-android armv7-linux-androideabi \
                  i686-linux-android x86_64-linux-android
```

**iOS** — Xcode + Command Line Tools, CocoaPods (`brew install cocoapods`).
Pour un appareil physique : `APPLE_DEVELOPMENT_TEAM=XXXXXXXXXX` ou
`bundle.iOS.developmentTeam` dans `tauri.conf.json`.

**Android** — Android Studio (pour son JDK et le SDK), NDK :

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

Les projets natifs (`src-tauri/gen/apple`, `src-tauri/gen/android`) sont
**versionnés** : le manifeste Android y est édité à la main et aucun mécanisme
Tauri ne permettrait de regénérer cette modification. Ils n'ont donc pas à être
initialisés après un clone. Pour repartir de zéro :

```bash
npm run tauri:ios:init
npm run tauri:android:init
```

---

## 3. Développement

```bash
# Simulateur iOS / émulateur Android — aucune option n'est nécessaire.
# Les deux scripts préparent eux-mêmes ce dont le CLI a besoin : le simulateur
# déjà démarré pour iOS, JAVA_HOME / ANDROID_HOME / NDK_HOME pour Android.
npm run tauri:ios
npm run tauri:android

# Un appareil physique doit joindre le Mac par le réseau : `--host` remplace
# `devUrl` par l'adresse LAN et renseigne TAURI_DEV_HOST, que vite.config.ts
# utilise pour le websocket de rechargement à chaud.
npm run tauri:ios:device
npm run tauri:android:device

# Ouvrir Xcode / Android Studio au lieu de lancer (signature, journaux natifs).
npx tauri ios dev --open
npx tauri android dev --open
```

Le simulateur iOS partage la pile réseau du Mac, et le CLI fait un `adb reverse`
pour l'émulateur Android : dans les deux cas `localhost:51737` fonctionne tel
quel.

Ces mêmes commandes sont exposées comme scripts de lancement dans Conductor
(`.conductor/settings.toml`) : **iOS**, **Android**, **desktop**, **dev** et
**mobile-server**. Ils sont marqués `available_in = ["local"]` quand ils
dépendent d'Xcode ou du SDK Android, et le mode est `nonconcurrent` — Vite et
le serveur Express occupent des ports fixes, imposés par le `devUrl` figé dans
les binaires Tauri.

Les scripts de lancement tournent dans un shell non interactif, sans terminal
pour répondre à une question. `scripts/ios-dev.sh` et `scripts/android-dev.sh`
sont là pour ça : ils démarrent le simulateur ou l'émulateur s'il n'y en a pas,
attendent qu'il soit réellement prêt à recevoir une installation, et
transmettent son nom au CLI — qui, sans argument, afficherait une liste et
attendrait un numéro.

Attention : l'application Conductor lit `.conductor/settings.toml` depuis la
branche par défaut du dépôt **distant**. Les scripts n'apparaissent donc
qu'une fois cette branche fusionnée. En attendant, les mêmes entrées peuvent
être posées dans `.conductor/settings.local.toml` du répertoire racine du
dépôt — fichier machine-local et non versionné, qui l'emporte sur le fichier
partagé.

### Développer l'interface mobile sans téléphone

Le plus rapide reste le navigateur : `http://localhost:51737/?mobile=1` force
l'interface mobile quelle que soit la largeur de la fenêtre, et `?mobile=0`
revient au bureau. Le choix est mémorisé (`src/lib/platform.ts`).

---

## 4. Accès mobile au serveur local

Par défaut le serveur Express n'écoute que sur `127.0.0.1` : c'est un sidecar de
l'application, pas un service réseau. Pour qu'un téléphone puisse l'atteindre,
deux voies équivalentes :

- **Dans l'application installée** — Réglages → *Accès mobile* → *Autoriser mes
  appareils*, puis redémarrer Findy. Le choix est enregistré dans
  `mobile-access.json`, à côté de la base. C'est la seule voie possible là-bas :
  le sidecar est lancé par le shell Rust avec un environnement figé.
- **En développement** — `npm run dev:mobile` (soit `FINDY_LAN_ACCESS=1
  npm run dev`). La variable l'emporte sur le réglage et le verrouille.

Le port n'est ouvert qu'au démarrage : basculer le réglage demande un
redémarrage, ce que l'interface indique. Refermer le serveur HTTP en cours de
route abandonnerait les requêtes en vol pour un gain nul.

Ce qui change alors, et **seulement** alors :

- le serveur écoute sur `0.0.0.0` ;
- les requêtes venues d'une adresse privée (RFC 1918) ne sont plus traitées
  comme « venues d'Internet » par `server/src/lib/publicSurface.ts` ;
- les origines LAN sont acceptées par CORS.

Le garde-fou du tunnel ngrok reste entier : toute requête portant un en-tête de
proxy (`x-forwarded-*`, `ngrok-trace-id`) est bloquée quoi qu'il arrive, et
l'authentification par jeton s'applique à chaque route comme ailleurs.

Au démarrage, le serveur imprime les adresses à saisir sur le téléphone. Elles
sont aussi exposées par `GET /api/mobile-access`, ce qu'affiche la carte
« Accès mobile » des réglages de l'application de bureau.

---

## 5. Publication

```bash
# iOS
FINDY_API_BASE=https://mon-serveur.example \
APPLE_DEVELOPMENT_TEAM=XXXXXXXXXX \
  npx tauri ios build --export-method app-store-connect

# Android
FINDY_API_BASE=https://mon-serveur.example npx tauri android build --aab
FINDY_API_BASE=https://mon-serveur.example npx tauri android build --apk --split-per-abi
```

`FINDY_API_BASE` est facultatif : sans lui, l'application demande l'adresse au
premier lancement. Avec lui, elle démarre directement sur l'écran de connexion.

Android exige un magasin de clés pour signer une version publiable ; il ne doit
jamais être versionné (`*.keystore`, `*.jks` sont ignorés par git).

---

## 6. Détails de configuration à connaître

- **Surcouches de configuration** — `src-tauri/tauri.ios.conf.json` et
  `tauri.android.conf.json` sont fusionnés (JSON Merge Patch, RFC 7396) par le
  CLI *et par `build.rs`*. C'est là que `bundle.externalBin` et
  `bundle.resources` sont mis à `null` : sans cela, la compilation échoue avant
  la première ligne de code, `build.rs` cherchant un sidecar
  `finance-server-aarch64-apple-ios` qui n'existe pas.
- **Capabilities** — `capabilities/desktop.json` porte `"platforms"` et
  regroupe `updater`, `process` et le glissement de fenêtre. Les greffons
  correspondants ne sont pas compilés sur mobile ; sans ce champ, `tauri-build`
  refuserait leurs permissions.
- **Trafic en clair (Android)** — les versions release bloquent le HTTP par
  défaut, ce qui rendrait inutilisable un serveur local en `http://`. Le
  fichier `gen/android/app/src/main/res/xml/network_security_config.xml`
  l'autorise ; une adresse `https://` reste vérifiée normalement.
- **APK de développement anormalement gros** — si `app-arm64-debug.apk`
  dépasse la centaine de mégaoctets, comparer sa taille sur disque à la somme
  de ses entrées (`python3 -m zipfile -l`). Un écart signale un empaquetage
  incrémental périmé : Gradle a gardé en place les octets d'une ancienne
  bibliothèque tout en mettant à jour l'entrée du catalogue. `rm -rf
  src-tauri/gen/android/app/build` répare. Passé cette taille, l'émulateur
  refuse l'installation (`INSTALL_FAILED_INSUFFICIENT_STORAGE`) bien avant
  d'avoir réellement rempli son disque : le gestionnaire de paquets applique
  un seuil de réserve.
- **Pages de 16 Ko (Android 15)** — `build.rs` ajoute
  `-Wl,-z,max-page-size=16384` à l'édition de liens des cibles Android. Sans
  cela, le système affiche un avertissement de compatibilité à chaque
  lancement et le Play Store refuse la mise en ligne. L'option passe par
  `cargo:rustc-link-arg`, qui s'ajoute aux RUSTFLAGS posés par le CLI Tauri —
  un `.cargo/config.toml` serait écrasé par ces variables d'environnement.
- **iOS** — `src-tauri/Info.ios.plist` est fusionné dans le `Info.plist` généré
  à chaque build. Il déclare `NSLocalNetworkUsageDescription` (iOS 14+ exige
  cette justification pour joindre une adresse privée), le thème sombre et
  l'orientation portrait. Éditer directement `gen/apple/*/Info.plist` serait
  perdu au prochain `tauri ios init`.
- **Routage** — l'application mobile utilise `HashRouter` : le protocole
  d'assets de Tauri ne résout pas `/transactions` après un rechargement complet,
  ce qui arrive au retour de veille.
- **CORS du serveur de développement.** Vite n'autorise par défaut que les
  origines `http(s)` en `localhost`. La webview iOS charge l'application depuis
  `tauri://localhost`, dont le schéma ne correspond pas : la requête de
  contrôle préalable repart sans `Access-Control-Allow-Origin` et tout POST
  échoue en « Load failed », alors que les GET simples passent. Android n'était
  pas touché — son origine `http://tauri.localhost` correspond au motif par
  défaut — ce qui donnait une panne d'apparence propre à iOS.
  `vite.config.ts` élargit donc `server.cors.origin` aux deux origines Tauri et
  aux adresses privées.
- **Le serveur est lancé avec l'accès mobile.** Le `beforeDevCommand` des
  surcouches iOS et Android est `npm run dev:mobile`, et non `npm run dev` :
  un lancement mobile démarre donc toujours un serveur joignable depuis le
  réseau, sans qu'il faille penser à lancer un second script en parallèle.
- **L'adresse de l'API doit être absolue sur mobile natif.** L'application est
  servie depuis `tauri://localhost` (iOS) ou `http://tauri.localhost`
  (Android) — y compris en `android dev`. Une URL relative n'en sort jamais
  pour atteindre un serveur, et côté Android l'interception passe par
  `shouldInterceptRequest`, qui n'expose pas le corps de la requête : un POST
  y arrive avec `Content-Length: 0`. Le symptôme est déroutant — le serveur
  répond « champ manquant » sur un formulaire pourtant rempli, et seules les
  requêtes GET semblent fonctionner.

  `src/lib/apiBase.ts` résout donc toujours une adresse absolue : celle saisie
  par l'utilisateur, sinon celle du serveur de développement
  (`VITE_DEV_SERVER_URL`, injectée par `vite.config.ts` et correcte aussi bien
  derrière `adb reverse` qu'avec `--host`), sinon l'écran de connexion au
  serveur prend la main.

---

## 7. L'interface mobile

`src/mobile/` est une **présentation parallèle**, pas une adaptation. Les écrans
de bureau reposent sur une grille à hauteur fixe de douze colonnes, des tableaux
et des actions au survol : aucune de ces trois choses n'a d'équivalent tactile.
Les réécrire en `max-md:` aurait doublé la taille de fichiers qui font déjà
1 600 lignes, pour un résultat que ni l'une ni l'autre plateforme n'aurait bien
porté.

Les deux interfaces partagent en revanche tout le reste : le même magasin
zustand (`src/store/index.ts`), les mêmes types, les mêmes routes, la même API.
Un écran mobile n'est qu'une autre lecture des mêmes états.

```
src/mobile/
  theme.ts              tokens : surfaces, rayons, échelle typographique
  MobileApp.tsx         routeur + barre d'onglets
  components/           primitives partagées (Sheet, ListRow, Field, Donut…)
  screens/              un fichier par onglet ou par destination
  hooks/
```

Le basculement se fait dans `src/App.tsx` via `useIsMobile()` — vrai sous
768 px, ou toujours sur un appareil natif. Les chemins sont identiques des deux
côtés : élargir la fenêtre conserve l'écran courant.

Quelques règles que les primitives font respecter, et qu'il vaut mieux ne pas
contourner :

- le défilement est celui du **document**, jamais d'un conteneur interne —
  c'est la seule façon d'avoir l'inertie, le rebond et le « taper la barre de
  statut pour remonter » d'iOS ;
- toute fenêtre modale est une `<Sheet>` : elle verrouille le défilement de
  fond, se ferme au geste vers le bas et au bouton retour d'Android ;
- aucune affordance au survol — `.tappable` et `active:` remplacent `hover:` ;
- 44 points minimum par cible, 16 px minimum par champ de saisie (en dessous,
  Safari zoome à la mise au point et ne dézoome jamais) ;
- les zones sûres passent par les variables `--safe-*` et l'espacement
  `pb-tabbar`, définis dans `src/index.css` et `tailwind.config.ts`.
