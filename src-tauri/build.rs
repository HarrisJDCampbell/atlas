fn main() {
    // Problems, drills and the Java harness are embedded with include_dir.
    println!("cargo:rerun-if-changed=code");
    tauri_build::build()
}
