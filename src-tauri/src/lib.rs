use std::sync::Mutex;
use tauri::{Manager, State};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

struct ServerProcess(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
        .plugin(tauri_plugin_shell::init())
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            // Répertoires persistants: ~/Library/Application Support/com.evey.finance/
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;

            let uploads_dir = app_data_dir.join("uploads");
            std::fs::create_dir_all(&uploads_dir)?;

            let db_path = app_data_dir.join("finance.db");
            let database_url = format!("file:{}", db_path.display());

            // Engine Prisma - copié dans Resources/ par Tauri
            let resource_dir = app.path().resource_dir()?;
            let engine_arm64 = resource_dir.join("libquery_engine-darwin-arm64.dylib.node");
            let engine_x64 = resource_dir.join("libquery_engine-darwin.dylib.node");

            let engine_path = if engine_arm64.exists() {
                engine_arm64
            } else {
                engine_x64
            };

            log::info!("DB: {}", database_url);
            log::info!("Uploads: {}", uploads_dir.display());
            log::info!("Prisma engine: {}", engine_path.display());

            // Démarrer le sidecar Express
            let (_, child) = app.shell()
                .sidecar("finance-server")?
                .env("DATABASE_URL", &database_url)
                .env("UPLOADS_DIR", uploads_dir.to_string_lossy().as_ref())
                .env("PRISMA_QUERY_ENGINE_LIBRARY", engine_path.to_string_lossy().as_ref())
                .env("PORT", "36321")
                .env("FRONTEND_URL", "tauri://localhost")
                .spawn()?;

            let state: State<ServerProcess> = app.state();
            *state.0.lock().unwrap() = Some(child);

            log::info!("Serveur Finance démarré sur le port 36321");
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state: State<ServerProcess> = window.state();
                let mut guard = state.0.lock().unwrap();
                if let Some(child) = guard.take() {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Erreur au démarrage de l'application");
}
