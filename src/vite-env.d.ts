/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Adresse du serveur d'API figée au build (packaging alternatif, déploiement). */
  readonly VITE_API_BASE?: string;
  /**
   * Adresse absolue du serveur de développement Vite, injectée par
   * `vite.config.ts`. Elle n'a de sens qu'en développement mobile : cf.
   * `src/lib/apiBase.ts`.
   */
  readonly VITE_DEV_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __TAURI__?: {
    shell?: {
      open: (url: string) => Promise<void>;
    };
  };
}
