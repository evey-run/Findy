use std::os::unix::process::CommandExt;
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Manager, State};

/// Ports essayés dans cet ordre. Le premier conserve la compatibilité avec les
/// installations existantes ; les suivants évitent une collision avec un autre
/// workspace ou un serveur de développement local.
const SIDECAR_PORTS: &[u16] = &[36321, 36322, 36323, 36324, 36325, 36326, 36327, 36328, 36329, 36330];

struct RunningServer {
    child: Child,
    port: u16,
}

struct ServerProcess(Mutex<Option<RunningServer>>);

/// Au-delà de cette taille, le journal du serveur est archivé en `.1` et repart
/// de zéro. Un seul palier suffit : on veut le dernier incident, pas un an
/// d'historique dans le dossier de l'utilisateur.
const SERVER_LOG_MAX_BYTES: u64 = 5 * 1024 * 1024;

/// Ouvre le journal du sidecar en ajout.
///
/// Sa sortie était jusqu'ici envoyée dans `/dev/null` : dans l'application
/// packagée, aucun message du serveur — migration échouée, erreur de
/// synchronisation bancaire, payload inattendu — n'était récupérable. Ils
/// atterrissent maintenant à côté de la base, dans le dossier de données.
fn open_server_log(data_dir: &std::path::Path) -> std::io::Result<std::fs::File> {
    let log_path = data_dir.join("server.log");

    if let Ok(metadata) = std::fs::metadata(&log_path) {
        if metadata.len() > SERVER_LOG_MAX_BYTES {
            let _ = std::fs::rename(&log_path, data_dir.join("server.log.1"));
        }
    }

    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
}

/// Résout le binaire sidecar à côté de l'exécutable courant — le même chemin
/// que `externalBin` produit dans le bundle .app, ou `target/debug` en dev.
fn sidecar_path() -> std::io::Result<PathBuf> {
    let exe = std::env::current_exe()?;
    let dir = exe
        .parent()
        .ok_or_else(|| std::io::Error::other("exécutable sans répertoire parent"))?;
    Ok(dir.join("finance-server"))
}

/// Retourne le PPID d'un processus, s'il existe.
fn ppid_of(pid: i32) -> Option<i32> {
    let out = Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "ppid=", "-o", "comm="])
        .output()
        .ok()?;
    let line = String::from_utf8_lossy(&out.stdout);
    let mut parts = line.split_whitespace();
    let ppid = parts.next()?.parse().ok()?;
    let comm = parts.next()?;
    if !comm.ends_with("finance-server") {
        return None;
    }
    Some(ppid)
}

/// Vrai si le PID est un sidecar `finance-server` orphelin : un serveur du
/// lancement précédent dont le parent (l'app) est mort. Un serveur rattaché à
/// une instance encore vivante n'est jamais touché.
fn is_orphaned_finance_server(pid: i32) -> bool {
    ppid_of(pid) == Some(1)
}

/// Tue un processus isolé (SIGTERM puis SIGKILL) — pour les orphelins qui
/// tiennent encore le port ou la base de données du lancement précédent.
fn kill_pid(pid: i32) {
    unsafe {
        libc::kill(pid, libc::SIGTERM);
    }
    std::thread::sleep(Duration::from_millis(1000));
    unsafe {
        libc::kill(pid, libc::SIGKILL);
    }
}

/// Demande l'arrêt de tout un groupe de processus : le serveur ET ses enfants
/// (ngrok…), car le sidecar est lancé dans son propre groupe.
fn terminate_process_group(pgid: i32) {
    if pgid <= 0 {
        return;
    }
    unsafe {
        libc::kill(-pgid, libc::SIGTERM);
    }
}

/// Au démarrage, un sidecar orphelin du lancement précédent (crash, kill forcé,
/// mise à jour, arrêt du système…) tient souvent encore le port 36321. Le
/// nouveau serveur meurt alors sur EADDRINUSE et le front affiche
/// « Serveur injoignable ». On purge donc ces orphelins avant de démarrer.
fn listener_pids(port: u16) -> Vec<i32> {
    let mut to_kill = Vec::new();

    if let Ok(out) = Command::new("lsof")
        .args(["-ti", &format!("tcp:{port}")])
        .output()
    {
        for pid in String::from_utf8_lossy(&out.stdout).split_whitespace() {
            if let Ok(pid) = pid.parse() {
                to_kill.push(pid);
            }
        }
    }

    to_kill.sort_unstable();
    to_kill.dedup();
    to_kill
}

/// Supprime les sidecars orphelins puis vérifie que le port appartient bien à
/// cette nouvelle instance. Sans cette vérification, l'interface pourrait se
/// connecter silencieusement à un ancien serveur de développement sur le même
/// port et afficher son erreur HTTP 500 au démarrage.
fn cleanup_stale_sidecars(port: u16) -> bool {
    let mut to_kill = listener_pids(port);

    // 2. Tous les `finance-server` orphelins, même s'ils n'écoutent plus.
    if let Ok(out) = Command::new("pgrep").args(["-x", "finance-server"]).output() {
        for pid in String::from_utf8_lossy(&out.stdout).split_whitespace() {
            if let Ok(pid) = pid.parse() {
                to_kill.push(pid);
            }
        }
    }

    to_kill.sort_unstable();
    to_kill.dedup();
    for pid in to_kill {
        if is_orphaned_finance_server(pid) {
            log::warn!("Sidecar orphelin du lancement précédent (pid {}), arrêt…", pid);
            kill_pid(pid);
        }
    }

    listener_pids(port).is_empty()
}

/// Réserve le premier port libre après avoir purgé les sidecars orphelins.
fn select_sidecar_port() -> std::io::Result<u16> {
    for &port in SIDECAR_PORTS {
        if cleanup_stale_sidecars(port) {
            return Ok(port);
        }
        log::info!("Port {} déjà utilisé, essai du suivant…", port);
    }

    Err(std::io::Error::new(
        std::io::ErrorKind::AddrInUse,
        format!("aucun port libre dans la plage {:?}", SIDECAR_PORTS),
    ))
}

/// Attend que le sidecar ait fini son initialisation (notamment les migrations)
/// et écoute réellement. Sans cette barrière, le frontend peut faire son tout
/// premier fetch avant l'ouverture du port et conserver « serveur injoignable ».
fn wait_for_sidecar(child: &mut Child, port: u16) -> std::io::Result<()> {
    let address: SocketAddr = format!("127.0.0.1:{port}")
        .parse()
        .expect("adresse localhost valide");
    let deadline = Instant::now() + Duration::from_secs(15);

    while Instant::now() < deadline {
        if TcpStream::connect_timeout(&address, Duration::from_millis(100)).is_ok() {
            return Ok(());
        }
        if let Some(status) = child.try_wait()? {
            return Err(std::io::Error::other(format!(
                "le sidecar s'est arrêté avant d'être prêt ({status})"
            )));
        }
        std::thread::sleep(Duration::from_millis(100));
    }

    Err(std::io::Error::new(
        std::io::ErrorKind::TimedOut,
        format!("le sidecar n'écoute pas sur le port {port} après 15 secondes"),
    ))
}

/// Arrête le serveur sidecar en tuant son groupe de processus (donc aussi
/// ngrok). Idempotent : appelé à la fermeture de fenêtre ET à la sortie de
/// l'application, quelle que soit la voie d'arrêt.
fn stop_server(state: &State<ServerProcess>) {
    let mut guard = state.0.lock().unwrap();
    if let Some(mut server) = guard.take() {
        let pid = server.child.id() as i32;
        log::info!("Arrêt du serveur Finance (pid {}, port {})", pid, server.port);
        terminate_process_group(pid);
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline {
            if server.child.try_wait().ok().flatten().is_some() {
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        // Le signal forcé n'est nécessaire que si le shutdown Node/ngrok ne
        // s'est pas terminé après SIGTERM.
        log::warn!("Le sidecar {} ne s'est pas arrêté à temps, SIGKILL…", pid);
        unsafe {
            libc::kill(-pid, libc::SIGKILL);
        }
        let _ = server.child.wait();
    }
}

/// Origine du sidecar réellement lancé. Le frontend l'appelle avant son
/// premier rendu, ce qui permet le fallback de port sans configuration Vite.
#[tauri::command]
fn api_base(state: State<ServerProcess>) -> Result<String, String> {
    state
        .0
        .lock()
        .map_err(|_| "État du serveur indisponible".to_owned())?
        .as_ref()
        // 127.0.0.1 et non « localhost » : le sidecar n'écoute que sur la
        // boucle IPv4, alors que « localhost » peut se résoudre en ::1.
        .map(|server| format!("http://127.0.0.1:{}", server.port))
        .ok_or_else(|| "Le serveur Findy n'est pas démarré".to_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                // Le chemin de téléchargement/installation de l'updater ne
                // journalise qu'en debug : à Info, un échec de signature ou de
                // remplacement du bundle ne laissait aucune trace exploitable.
                .level_for("tauri_plugin_updater", log::LevelFilter::Trace)
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
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

            // Le bundle embarque les DEUX moteurs, quelle que soit l'architecture
            // construite. Choisir « celui qui existe » revenait donc à toujours
            // prendre l'arm64 : sur un Mac Intel, le sidecar x86_64 ne pouvait pas
            // charger cette bibliothèque et l'application ne démarrait pas. C'est
            // l'architecture de compilation qui tranche, pas la présence du fichier.
            let (engine_path, engine_fallback) = if cfg!(target_arch = "aarch64") {
                (engine_arm64, engine_x64)
            } else {
                (engine_x64, engine_arm64)
            };
            let engine_path = if engine_path.exists() { engine_path } else { engine_fallback };

            log::info!("DB: {}", database_url);
            log::info!("Uploads: {}", uploads_dir.display());
            log::info!("Configuration persistante (sync + tunnel + choix bancaire + médias): {}", app_data_dir.display());
            log::info!("Prisma engine: {}", engine_path.display());

            // Si le port historique est occupé, basculer vers un port libre.
            let sidecar_port = select_sidecar_port()?;

            // Journal du serveur : deux descripteurs sur le même fichier, l'un
            // pour stdout, l'autre pour stderr. Si l'ouverture échoue (dossier
            // en lecture seule), on retombe sur l'ancien comportement plutôt
            // que d'empêcher l'application de démarrer.
            let server_log_path = app_data_dir.join("server.log");
            let (server_log_out, server_log_err) = match open_server_log(&app_data_dir) {
                Ok(file) => match file.try_clone() {
                    Ok(clone) => {
                        log::info!("Journal du serveur: {}", server_log_path.display());
                        (Stdio::from(file), Stdio::from(clone))
                    }
                    Err(error) => {
                        log::warn!("Journal du serveur indisponible: {}", error);
                        (Stdio::null(), Stdio::null())
                    }
                },
                Err(error) => {
                    log::warn!("Journal du serveur indisponible: {}", error);
                    (Stdio::null(), Stdio::null())
                }
            };

            // Démarrer le sidecar Express dans SON PROPRE groupe de processus :
            // à la fermeture, on peut tuer le serveur et tous ses enfants (ngrok)
            // d'un seul signal, sans toucher au reste du système.
            let bin_path = sidecar_path()?;
            log::info!("Sidecar: {}", bin_path.display());
            let mut child = Command::new(&bin_path)
                .env("DATABASE_URL", &database_url)
                .env("UPLOADS_DIR", uploads_dir.to_string_lossy().as_ref())
                // Les identifiants de synchronisation (notamment Enable
                // Banking) ne doivent jamais être écrits dans Resources/ :
                // ce dossier est installé sous /Applications et peut être en
                // lecture seule. Le sidecar les stocke ici avec la base locale.
                .env("FINDY_DATA_DIR", app_data_dir.to_string_lossy().as_ref())
                .env("PRISMA_QUERY_ENGINE_LIBRARY", engine_path.to_string_lossy().as_ref())
                .env("PORT", sidecar_port.to_string())
                .env("FRONTEND_URL", "tauri://localhost")
                .stdin(Stdio::null())
                .stdout(server_log_out)
                .stderr(server_log_err)
                .process_group(0)
                .spawn()?;

            if let Err(error) = wait_for_sidecar(&mut child, sidecar_port) {
                log::error!("Le sidecar n'est pas prêt: {}", error);
                terminate_process_group(child.id() as i32);
                let _ = child.wait();
                return Err(error.into());
            }

            log::info!(
                "Serveur Finance démarré sur le port {} (pid {})",
                sidecar_port,
                child.id()
            );

            let state: State<ServerProcess> = app.state();
            *state.0.lock().unwrap() = Some(RunningServer { child, port: sidecar_port });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                stop_server(&window.state::<ServerProcess>());
            }
        })
        .invoke_handler(tauri::generate_handler![api_base])
        .build(tauri::generate_context!())
        .expect("Erreur au build de l'application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                stop_server(&app_handle.state::<ServerProcess>());
            }
        });
}
