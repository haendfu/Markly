use std::sync::Mutex;
use std::{fs, path::Path};
use serde::Serialize;
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

/* ---------- 文件库操作（绕过 fs 插件作用域，任意目录可用） ---------- */

#[derive(Serialize, Clone)]
pub struct TreeEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<TreeEntry>>,
}

fn is_markdown(name: &str) -> bool {
    let lower = name.to_lowercase();
    [".md", ".markdown", ".mdown", ".mkd"]
        .iter()
        .any(|e| lower.ends_with(e))
}

/// 递归扫描目录，只保留 markdown 文件与文件夹；单条目失败不影响整体
fn scan_dir(dir: &Path, depth: usize) -> Vec<TreeEntry> {
    let Ok(rd) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out: Vec<TreeEntry> = Vec::new();
    for entry in rd.flatten() {
        let Ok(name) = entry.file_name().into_string() else { continue };
        if name.starts_with('.') {
            continue;
        }
        let Ok(ft) = entry.file_type() else { continue };
        let path = entry.path();
        if ft.is_dir() {
            let children = if depth > 0 {
                Some(scan_dir(&path, depth - 1))
            } else {
                None
            };
            out.push(TreeEntry {
                name,
                path: path.to_string_lossy().into_owned(),
                is_dir: true,
                children,
            });
        } else if is_markdown(&name) {
            out.push(TreeEntry {
                name,
                path: path.to_string_lossy().into_owned(),
                is_dir: false,
                children: None,
            });
        }
    }
    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    out
}

#[tauri::command]
fn scan_tree(root: String) -> Vec<TreeEntry> {
    scan_dir(Path::new(&root), 4)
}

#[tauri::command]
fn create_entry(path: String, is_dir: bool) -> Result<(), String> {
    if is_dir {
        fs::create_dir_all(&path).map_err(|e| e.to_string())
    } else {
        if Path::new(&path).exists() {
            return Err("文件已存在".into());
        }
        fs::write(&path, "").map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn rename_entry(old_path: String, new_path: String) -> Result<(), String> {
    if Path::new(&new_path).exists() {
        return Err("目标名称已存在".into());
    }
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
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
        .invoke_handler(tauri::generate_handler![
            trash_item,
            startup_file,
            scan_tree,
            create_entry,
            rename_entry
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
