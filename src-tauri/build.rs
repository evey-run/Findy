fn main() {
  // Les commandes Rust exposées au frontend doivent avoir une permission ACL
  // générée, sans quoi elles sont retirées des builds release.
  tauri_build::try_build(
    tauri_build::Attributes::new().app_manifest(
      tauri_build::AppManifest::new().commands(&["api_base"]),
    ),
  )
  .expect("échec de la génération des permissions Tauri");
}
