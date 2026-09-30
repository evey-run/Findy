import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Renseignée par `tauri ios dev --host` / `tauri android dev --host` : c'est
// l'adresse LAN du Mac, celle que le téléphone doit joindre. Absente en
// desktop, en simulateur iOS et en émulateur Android (le CLI y fait un
// `adb reverse`, donc `localhost` suffit).
const tauriDevHost = process.env.TAURI_DEV_HOST

const DEV_PORT = 51737

/**
 * Adresse absolue du serveur de développement.
 *
 * Sur Android, la webview charge l'application depuis le protocole d'assets de
 * Tauri (`http://tauri.localhost`) même en `android dev`. Or l'interception de
 * ce protocole passe par `shouldInterceptRequest`, qui n'expose pas le corps
 * des requêtes : un `fetch('/api/…', { method: 'POST' })` y arrive vidé de son
 * contenu. Viser le serveur en absolu contourne l'interception — d'où cette
 * valeur, injectée à la compilation parce que le front n'a aucun moyen de
 * deviner le port ni l'adresse LAN choisie par `--host`.
 */
const devServerUrl = `http://${tauriDevHost ?? 'localhost'}:${DEV_PORT}`

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_DEV_SERVER_URL': JSON.stringify(devServerUrl),
  },
  // Le CLI Tauri affiche ses propres erreurs de compilation Rust : les effacer
  // à chaque rechargement de Vite les rendrait illisibles.
  clearScreen: false,
  server: {
    host: tauriDevHost || '0.0.0.0',
    port: DEV_PORT,
    // Vite n'autorise par défaut que les origines `http(s)` en localhost —
    // `/^https?:\/\/(?:(?:[^:]+\.)?localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/`.
    // La webview iOS charge l'application depuis `tauri://localhost`, dont le
    // schéma ne correspond pas : sa requête de contrôle préalable repart sans
    // en-tête `Access-Control-Allow-Origin`, et tout POST échoue en
    // « Load failed » alors que les GET simples passent. Android n'était pas
    // touché, son origine `http://tauri.localhost` correspondant au motif —
    // d'où une panne qui semblait ne viser qu'iOS.
    cors: {
      origin: [
        /^https?:\/\/(?:(?:[^:]+\.)?localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/,
        'tauri://localhost',
        // Un téléphone qui ouvre l'application dans son navigateur, ou une
        // webview lancée avec `--host`, arrive par l'adresse LAN du Mac.
        /^http:\/\/(?:10\.|127\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)[\d.]+(?::\d+)?$/,
      ],
    },
    // Sans `strictPort`, Vite glisse sur 51738 si le port est pris — et le
    // `devUrl` figé dans le binaire mobile pointe alors dans le vide.
    strictPort: true,
    // Le websocket de rechargement à chaud doit viser l'adresse LAN : depuis le
    // téléphone, « localhost » désigne le téléphone.
    hmr: tauriDevHost ? { protocol: 'ws', host: tauriDevHost, port: DEV_PORT + 1 } : undefined,
    // Le dossier Rust est surveillé par le CLI Tauri ; le laisser à Vite
    // déclenche un rechargement complet à chaque écriture de `gen/`.
    watch: { ignored: ['**/src-tauri/**'] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:36321',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://127.0.0.1:36321',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
