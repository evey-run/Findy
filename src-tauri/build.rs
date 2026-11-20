fn main() {
  // Android 15 impose des pages mémoire de 16 Ko : une bibliothèque native
  // alignée sur 4 Ko démarre en mode de compatibilité, avec un avertissement
  // système à chaque lancement, et sera refusée par le Play Store. Le NDK ne
  // l'applique pas d'office ; on ajoute donc l'option au moment de l'édition
  // de liens. `rustc-link-arg` s'ajoute aux RUSTFLAGS que le CLI Tauri
  // positionne déjà par variable d'environnement, là où un `.cargo/config.toml`
  // serait purement et simplement écrasé.
  if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
    println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");

    // Les symboles de débogage de la bibliothèque native pèsent 128 Mo — soit
    // la quasi-totalité des 263 Mo d'un APK de développement, qu'un émulateur
    // un peu chargé refuse alors d'installer. On ne débogue pas le shell Rust
    // depuis un téléphone : `--strip-debug` retire le DWARF et conserve la
    // table des symboles, dont le `start_app` que le CLI Tauri vérifie.
    // Passer par le profil Cargo (`strip = "debuginfo"`) coûterait les mêmes
    // symboles côté desktop, où ils servent encore.
    println!("cargo:rustc-link-arg=-Wl,--strip-debug");
  }

  // `option_env!("FINDY_API_BASE")` est résolu à la compilation : sans cette
  // ligne, changer la variable ne provoquerait aucune reconstruction et le
  // binaire mobile garderait l'adresse précédente.
  println!("cargo:rerun-if-env-changed=FINDY_API_BASE");

  // Les commandes Rust exposées au frontend doivent avoir une permission ACL
  // générée, sans quoi elles sont retirées des builds release.
  tauri_build::try_build(
    tauri_build::Attributes::new().app_manifest(
      tauri_build::AppManifest::new().commands(&["api_base"]),
    ),
  )
  .expect("échec de la génération des permissions Tauri");
}
