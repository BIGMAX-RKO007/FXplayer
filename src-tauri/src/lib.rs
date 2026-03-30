use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Emitter;
use uuid::Uuid;

// ─── 日志事件结构（序列化后通过 Tauri Event 推送到前端）───
#[derive(Clone, Serialize)]
struct LogEvent {
    level:   String,
    stage:   String,
    message: String,
}

fn emit_log(app: &tauri::AppHandle, level: &str, stage: &str, message: &str) {
    let event = LogEvent {
        level:   level.to_string(),
        stage:   stage.to_string(),
        message: message.to_string(),
    };
    let _ = app.emit("dream-log", &event);
    eprintln!("[{}][{}] {}", level, stage, message);
}

// ─── 全局状态 ───
struct AppState {
    call_count: Mutex<u32>,
    gemini_api_key: String,
}

// ─── 前后端通信数据契约 ───
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ActionScript {
    pub target_id: Option<String>,
    pub action: String,
    pub position: Option<[f32; 3]>,
    pub animation: Option<String>,
    pub asset_id: Option<String>,
    pub geometry_type: Option<String>,
    pub points: Option<Vec<[f32; 2]>>,
    pub color: Option<String>,
    pub scale: Option<[f32; 3]>,
    
    // Server injected logic
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub lifespan: Option<u64>,
}

// ─── 配置读取 ───
#[derive(Deserialize)]
struct Config {
    gemini_api_key: String,
}

// ─── LLM 抽象层 ───
pub trait DreamInterpreter {
    async fn interpret(&self, input: String, scene_snapshot: Option<String>) -> Result<Vec<ActionScript>, String>;
}

// ─── Gemini 实现 ───
pub struct GeminiInterpreter {
    api_key:    String,
    app_handle: tauri::AppHandle,
}

impl GeminiInterpreter {
    fn log(&self, level: &str, stage: &str, message: &str) {
        emit_log(&self.app_handle, level, stage, message);
    }
}

impl DreamInterpreter for GeminiInterpreter {
    async fn interpret(&self, input: String, scene_snapshot: Option<String>) -> Result<Vec<ActionScript>, String> {
        let client = reqwest::Client::new();
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
            self.api_key
        );

        let system_instruction = "你是一个具备环境感知能力的 3D 梦境导演。你负责解析用户的意图，并针对当前场景返回**动作剧本（ActionScript）**的 JSON 数组。
场景上下文会在此次对话中以 sceneSnapshot 传给你，里面包含了当前舞台上的所有物体以及坐标状态。
出于视觉连贯性，用户的指令不仅可能是生成新物体，也有可能是对现存物体的操控。
基于这个环境，你必须且仅输出 JSON Array，每个元素符合以下契约：
{ \"action\": \"moveTo\"|\"playAnimation\"|\"spawn\"|\"remove\" }
扩展字段说明：
- moveTo: 必须带 targetId (你要移动的物体id), 和 position ([x, y, z] 目标点坐标)。
- playAnimation: 必须带 targetId, 以及 animation (具体资产可用动画如 run/idle/jump)。
- spawn: (生成新物体) 
  * 对于素材库资产，带 assetId (如 player/grass)，position，scale
  * 对于 AI 几何建模物体，带 geometryType (lathe 或 extrude)，color，position，scale，以及必要的二维轮廓极点数组 points。
- remove: 必须带 targetId
注意：不要带 Markdown 代码块等格式，要求必须输出纯粹的 JSON Array 形式的剧本！";

        let input_text = match scene_snapshot {
            Some(ref snap) => format!("当前场景快照状态:\n{}\n\n用户指令:\n{}", snap, input),
            None => format!("用户指令:\n{}", input),
        };

        let body = serde_json::json!({
            "system_instruction": {
                "parts": [{ "text": system_instruction }]
            },
            "contents": [{
                "parts": [{ "text": input_text }]
            }]
        });

        // ── 完整请求日志（DevTools Network 级别）──
        let body_pretty = serde_json::to_string_pretty(&body)
            .unwrap_or_else(|_| body.to_string());

        self.log("debug", "GEMINI/REQ", &format!(
            "=== REQUEST ===\nPOST {url}\n--- [请求头] ---\nContent-Type: application/json\nUser-Agent: reqwest/0.12 (Tauri/Rust)\nAccept: */*\nHost: generativelanguage.googleapis.com\n--- [请求体 JSON 完整] ---\n{body_pretty}"
        ));
        self.log("info", "GEMINI/HTTP", ">> 正在发送 HTTPS POST...");

        let res = client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                let msg = format!("网络请求失败: {}", e);
                self.log("error", "GEMINI/HTTP", &msg);
                msg
            })?;

        // ── 先捕获全部响应头，再消费 body ──
        let status = res.status();
        let status_line = format!(
            "HTTP/1.1 {} {}",
            status.as_u16(),
            status.canonical_reason().unwrap_or("")
        );

        let mut resp_headers_str = String::new();
        for (name, value) in res.headers().iter() {
            let val = value.to_str().unwrap_or("(binary/non-utf8)");
            resp_headers_str.push_str(&format!("{name}: {val}\n"));
        }

        self.log(
            if status.is_success() { "success" } else { "error" },
            "GEMINI/RESP",
            &format!(
                "=== RESPONSE ===\n{status_line}\n--- [响应头 全部] ---\n{}",
                resp_headers_str.trim_end()
            ),
        );

        // ── 消费响应体（必须在 headers 捕获完后）──
        let response_text = res.text().await.map_err(|e| e.to_string())?;

        self.log("debug", "GEMINI/RESP_BODY", &format!(
            "=== RESPONSE BODY (完整, {} 字符) ===\n{response_text}",
            response_text.len()
        ));

        // ── 解析 JSON 外壳 ──
        self.log("info", "GEMINI/PARSE", "开始解析 Gemini JSON 包装层...");
        let json_body: serde_json::Value = serde_json::from_str(&response_text)
            .map_err(|e| {
                let msg = format!("无法解析响应体为 JSON: {}", e);
                self.log("error", "GEMINI/PARSE", &msg);
                msg
            })?;

        if json_body.get("error").is_some() {
            let msg = format!("大模型原生报错: {response_text}");
            self.log("error", "GEMINI/PARSE", &msg);
            return Err(msg);
        }
        self.log("success", "GEMINI/PARSE", "响应 JSON 包装层解析成功，检查 candidates...");

        let mut raw_content = json_body["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .unwrap_or("")
            .trim()
            .to_string();

        if raw_content.is_empty() {
            let msg = format!("candidates 中未提取到文本, 完整响应: {response_text}");
            self.log("error", "GEMINI/PARSE", &msg);
            return Err(msg);
        }
        self.log("info", "GEMINI/CONTENT", &format!(
            "提取到模型原始文本 ({} 字符):\n{raw_content}",
            raw_content.len()
        ));

        // ── Markdown 代码块剥离 ──
        let before_len = raw_content.len();
        if raw_content.starts_with("```json") {
            raw_content = raw_content.trim_start_matches("```json").to_string();
        } else if raw_content.starts_with("```") {
            raw_content = raw_content.trim_start_matches("```").to_string();
        }
        if raw_content.ends_with("```") {
            raw_content = raw_content.trim_end_matches("```").to_string();
        }
        raw_content = raw_content.trim().to_string();

        if raw_content.len() != before_len {
            self.log("debug", "GEMINI/CLEAN", &format!(
                "Markdown 包壳已剥离: {} -> {} 字符\n清洗后内容:\n{raw_content}",
                before_len, raw_content.len()
            ));
        }

        // ── serde 反序列化 ──
        self.log("info", "GEMINI/DESERIALIZE", "尝试将 JSON 映射至 ActionScript 数组...");
        let mut parsed_scripts: Vec<ActionScript> = serde_json::from_str(&raw_content)
            .map_err(|e| {
                let msg = format!(
                    "ActionScript 数组反序列化失败: {e}\n问题 JSON:\n{raw_content}"
                );
                self.log("error", "GEMINI/DESERIALIZE", &msg);
                msg
            })?;

        self.log("success", "GEMINI/DESERIALIZE", &format!(
            "剧本解析成功: 包含 {} 条动作",
            parsed_scripts.len()
        ));

        // ── UUID + lifespan 注入以及散点接管 ──
        for script in &mut parsed_scripts {
            if script.action == "spawn" {
                script.id = Some(Uuid::new_v4().to_string());
                script.lifespan = Some(5000 + (rand::random::<f32>() * 15000.0) as u64);
                
                // 接管生成物体的初始位置防重叠
                if script.position.is_none() {
                    let offset_x = -5.0 + rand::random::<f32>() * 10.0;
                    let offset_z = -5.0 + rand::random::<f32>() * 10.0;
                    script.position = Some([offset_x, 0.0, offset_z]);
                }
            }
        }

        self.log("success", "GEMINI", "动作剧本构建完成，准备返回前端大导演调度");
        Ok(parsed_scripts)
    }
}

// ─── 核心 Tauri 指令 ───
#[tauri::command]
async fn interpret_dream(
    input: String,
    scene_snapshot: Option<String>,   // 模块二：前端传入的场景快照 JSON
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<ActionScript>, String> {
    emit_log(&app_handle, "info", "INVOKE", &format!(">> 收到前端指令: input=\"{input}\""));

    // 打印场景快照摘要（模块二数据流）
    match &scene_snapshot {
        Some(snapshot) => {
            emit_log(&app_handle, "info", "SCENE/SNAPSHOT", &format!(
                "收到场景快照 ({}字符)——已作为环境上下文随 prompt 注入",
                snapshot.len()
            ));
            emit_log(&app_handle, "debug", "SCENE/SNAPSHOT", &format!(
                "快照内容: {}",
                &snapshot[..snapshot.len().min(300)]
            ));
        }
        None => {
            emit_log(&app_handle, "debug", "SCENE/SNAPSHOT", "未传入场景快照（空场景或老版调用）");
        }
    }

    let call_count = {
        let mut count = state.call_count.lock().unwrap();
        *count += 1;
        *count
    };
    emit_log(&app_handle, "debug", "RUST/STATE", &format!(
        "全局调用计数: #{call_count} | API Key 已加载: {}",
        if state.gemini_api_key.is_empty() { "NO (空)" } else { "YES (有效)" }
    ));

    let api_key = state.gemini_api_key.clone();
    let interpreter = GeminiInterpreter { api_key, app_handle: app_handle.clone() };

    emit_log(&app_handle, "info", "RUST/INTERPRETER", "GeminiInterpreter 实例已创建，启动 interpret()...");

    match interpreter.interpret(input, scene_snapshot).await {
        Ok(scripts) => {
            emit_log(&app_handle, "success", "INVOKE", &format!(
                "指令处理完毕，返回 {} 步 ActionScript",
                scripts.len()
            ));
            Ok(scripts)
        }
        Err(e) => {
            emit_log(&app_handle, "error", "INVOKE/FALLBACK", &format!(
                "解析失败，启动 Fallback 白色方块: {}", &e[..e.len().min(200)]
            ));

            let offset_x = -4.0 + rand::random::<f32>() * 8.0;
            let offset_z = -4.0 + rand::random::<f32>() * 8.0;
            
            let fallback_script = ActionScript {
                id:            Some(Uuid::new_v4().to_string()),
                action:        "spawn".into(),
                geometry_type: Some("box".into()),
                color:         Some("#ffffff".into()),
                position:      Some([offset_x, 0.0, offset_z]),
                scale:         Some([1.2, 1.2, 1.2]),
                lifespan:      Some(15000),
                ..Default::default()
            };

            emit_log(&app_handle, "warn", "INVOKE/FALLBACK", &format!(
                "Fallback box id={}... position=[{:.2}, 0, {:.2}]",
                fallback_script.id.as_ref().unwrap().clone().chars().take(8).collect::<String>(), offset_x, offset_z
            ));
            Ok(vec![fallback_script])
        }
    }
}

// ─── 配置加载 ───
fn load_api_key() -> String {
    let file_content = include_str!("../../src-tauri/config.toml");
    if let Ok(config) = toml::from_str::<Config>(file_content) {
        eprintln!("[info][STARTUP] API Key 从 config.toml 加载成功");
        return config.gemini_api_key;
    }
    eprintln!("[warn][STARTUP] 找不到有效的 config.toml，API Key 为空！");
    "".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let api_key = load_api_key();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            call_count: Mutex::new(0),
            gemini_api_key: api_key,
        })
        .invoke_handler(tauri::generate_handler![interpret_dream])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
