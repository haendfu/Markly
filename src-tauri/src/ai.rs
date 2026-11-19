//! AI 问答用的流式 HTTP 转发。
//!
//! 为什么不用前端 fetch：WebView2 里请求第三方 API 会被 CORS 挡住
//! （api.openai.com 不返回 Access-Control-Allow-Origin），而且 API Key
//! 放在请求头里本来也不该经过页面上下文。这里用 reqwest 直连，把响应
//! 分片通过事件 `ai:chunk` 回传给前端，前端只负责解析各家 SSE 协议。

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// 进行中的请求：id → 取消标志（前端「停止」按钮用）
static CANCEL: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn cancel_map() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    CANCEL.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChunkEvent {
    id: String,
    data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorEvent {
    id: String,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct IdEvent {
    id: String,
}

fn emit_chunk(app: &AppHandle, id: &str, text: &str) {
    let _ = app.emit(
        "ai:chunk",
        ChunkEvent {
            id: id.to_string(),
            data: text.to_string(),
        },
    );
}

/// 逐块把字节解码成文本。
/// 网络分片可能把一个中文字符劈成两半，末尾不完整的那几个字节要留到下一块。
fn flush_utf8(app: &AppHandle, id: &str, buf: &mut Vec<u8>) {
    loop {
        if buf.is_empty() {
            return;
        }
        match std::str::from_utf8(buf) {
            Ok(text) => {
                let text = text.to_string();
                buf.clear();
                emit_chunk(app, id, &text);
                return;
            }
            Err(err) => {
                let valid = err.valid_up_to();
                if valid > 0 {
                    let text = String::from_utf8_lossy(&buf[..valid]).into_owned();
                    buf.drain(..valid);
                    emit_chunk(app, id, &text);
                }
                match err.error_len() {
                    // 真的非法字节：丢掉并继续，避免整个流卡住
                    Some(len) => {
                        buf.drain(..len);
                        continue;
                    }
                    // 末尾是不完整的多字节字符：等下一块
                    None => return,
                }
            }
        }
    }
}

fn preview(text: &str, max: usize) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= max {
        return trimmed.to_string();
    }
    trimmed.chars().take(max).collect::<String>() + "…"
}

async fn run_stream(
    app: &AppHandle,
    id: &str,
    url: &str,
    headers: &HashMap<String, String>,
    body: &str,
    flag: &Arc<AtomicBool>,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败：{e}"))?;

    // 注意：reqwest 的 .header() 是「追加」而不是「覆盖」。如果调用方
    // 已经自带 content-type（前端各家协议都会带），这里再追加一次就会变成
    // `content-type: application/json, application/json`，Anthropic 会直接
    // 回 415 Expected request with Content-Type: application/json。
    let has_content_type = headers
        .keys()
        .any(|key| key.eq_ignore_ascii_case("content-type"));

    let mut req = client.post(url).body(body.to_string());
    if !has_content_type {
        req = req.header("content-type", "application/json");
    }
    for (key, value) in headers {
        req = req.header(key.as_str(), value.as_str());
    }

    let mut res = req.send().await.map_err(|e| format!("请求失败：{e}"))?;
    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(format!("HTTP {}：{}", status.as_u16(), preview(&text, 600)));
    }

    let mut buf: Vec<u8> = Vec::new();
    loop {
        if flag.load(Ordering::Relaxed) {
            let _ = app.emit("ai:cancelled", IdEvent { id: id.to_string() });
            return Ok(());
        }
        match res.chunk().await {
            Ok(Some(bytes)) => {
                buf.extend_from_slice(&bytes);
                flush_utf8(app, id, &mut buf);
            }
            Ok(None) => {
                if !buf.is_empty() {
                    flush_utf8(app, id, &mut buf);
                }
                let _ = app.emit("ai:done", IdEvent { id: id.to_string() });
                return Ok(());
            }
            Err(e) => return Err(format!("读取响应失败：{e}")),
        }
    }
}

/// 发起一次流式请求。事件：`ai:chunk` / `ai:done` / `ai:cancelled` / `ai:error`
#[tauri::command]
pub async fn ai_stream(
    app: AppHandle,
    id: String,
    url: String,
    headers: HashMap<String, String>,
    body: String,
) -> Result<(), String> {
    let flag = Arc::new(AtomicBool::new(false));
    cancel_map().lock().unwrap().insert(id.clone(), flag.clone());

    let result = run_stream(&app, &id, &url, &headers, &body, &flag).await;
    cancel_map().lock().unwrap().remove(&id);

    if let Err(message) = result {
        let _ = app.emit("ai:error", ErrorEvent { id, message });
    }
    Ok(())
}

/// 停止某个进行中的请求
#[tauri::command]
pub fn ai_cancel(id: String) {
    if let Some(flag) = cancel_map().lock().unwrap().get(&id) {
        flag.store(true, Ordering::Relaxed);
    }
}
