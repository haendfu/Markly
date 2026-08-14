use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[tauri::command]
fn trash_item(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| e.to_string())
}

/// 启动时通过命令行传入的 markdown 文件路径（双击文件打开） */
#[tauri::command]
fn startup_file(state: tauri::State<Mutex<Option<String>>>) -> Option<String> {
    state.inner().lock().unwrap().clone()
}

pub fn run() {
    let first_md = std::env::args()
        .nth(1)
        .filter(|p| !p.starts_with('-') && p.to_lowercase().ends_with(".md"));

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // 已有实例时，把新打开的文件路径转发给前端
            if let Some(path) = argv.get(1) {
                let _ = app.emit("markly:open-file", path);
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Mutex::new(first_md))
        .invoke_handler(tauri::generate_handler![trash_item, startup_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
