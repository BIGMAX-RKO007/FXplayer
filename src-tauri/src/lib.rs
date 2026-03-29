use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use uuid::Uuid;

// 定义状态管理器中的计数器和 API Key
struct AppState {
    call_count: Mutex<u32>,
    gemini_api_key: String,
}

// 通信协议对象：返回给前端的 3D 实体定义
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SceneObject {
    #[serde(default)]
    pub id: String,
    pub geometry_type: String, // "box" | "sphere" | "torus" | "lathe" | "extrude"
    pub color: String,
    pub position: [f32; 3],
    pub scale: [f32; 3],
    #[serde(default)]
    pub points: Vec<[f32; 2]>, // 极客特权：参数化曲线定点池
    #[serde(default)]
    pub lifespan: u64, // 生命周期，毫秒
}

// 配置文件序列化结构
#[derive(Deserialize)]
struct Config {
    gemini_api_key: String,
}

// 抽象 LLM 解析器 特性
pub trait DreamInterpreter {
    async fn interpret(&self, input: String) -> Result<SceneObject, String>;
}

// Gemini API 特定实现
pub struct GeminiInterpreter {
    api_key: String,
}

impl DreamInterpreter for GeminiInterpreter {
    async fn interpret(&self, input: String) -> Result<SceneObject, String> {
        let client = reqwest::Client::new();
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
            self.api_key
        );

        let system_instruction = "你是一个硬核 3D 建模师。你的任务是将用户的文字描述转为参数化二维曲线的 JSON 格式数据。
由于渲染引擎使用 Three.js，你不可直接选用成品三维物体，必须亲手使用一系列二维坐标极点 points 构建它：
如果是轴对称物体 (如苹果、杯子、瓶子)，请使用 \"lathe\" (旋转体)，在一侧 X 周提供二维轮廓曲线的坐标点(y 从下到上排列，x >= 0)。 
如果是异形或平截面物体 (如香蕉、星星、金字塔侧视图)，请使用 \"extrude\" (挤压体)，在 XY 平面勾勒一个完整的闭合路径的二维极点。
必须且仅输出 JSON，严格符合以下契约：
{ 
  \"geometryType\": \"lathe\"|\"extrude\",
  \"points\": [[x1, y1], [x2, y2], ..., [xn, yn]], 
  \"color\": \"#hex\", 
  \"position\": [x, y, z], 
  \"scale\": [1, 1, 1] 
}
对于 points 数组：务必提供足够的细分顶点(建议 6~15 个点)以呈现良好的形状！这是真正的骨架生成。此JSON是仅有的输出。";

        let body = serde_json::json!({
            "system_instruction": {
                "parts": [{ "text": system_instruction }]
            },
            "contents": [{
                "parts": [{ "text": input }]
            }]
        });

        let res = client.post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        let response_text = res.text().await.map_err(|e| e.to_string())?;

        // 解析 Gemini 的标准返回结构
        let json_body: serde_json::Value = serde_json::from_str(&response_text)
            .map_err(|e| format!("无法解析响应体: {}", e))?;

        // 如果模型拒绝或者出现别的API错误，candidates 可能不存在
        if json_body.get("error").is_some() {
            return Err(format!("大模型原生报错: {}", response_text));
        }

        let mut raw_content = json_body["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .unwrap_or("")
            .trim()
            .to_string();

        if raw_content.is_empty() {
            return Err(format!("未提取到文本，原始响应体为: {}", response_text));
        }

        // 鲁棒性提取：脱离 Markdown ```json 头尾
        if raw_content.starts_with("```json") {
            raw_content = raw_content.trim_start_matches("```json").to_string();
        } else if raw_content.starts_with("```") {
            raw_content = raw_content.trim_start_matches("```").to_string();
        }
        if raw_content.ends_with("```") {
            raw_content = raw_content.trim_end_matches("```").to_string();
        }

        raw_content = raw_content.trim().to_string();

        let mut parsed_object: SceneObject = serde_json::from_str(&raw_content)
            .map_err(|e| format!("非法的模型JSON输出: {} \n原始内容预览: {}", e, raw_content))?;

        // 强制进行 uuid 修正以及赋予寿命
        parsed_object.id = Uuid::new_v4().to_string();
        parsed_object.lifespan = 5000 + (rand::random::<f32>() * 15000.0) as u64; // 赋予 5~20 秒的寿命
        
        // 【核心防重叠】：剥夺 AI 的落点选择权，Rust 接管散列坐标生成
        let offset_x = -5.0 + rand::random::<f32>() * 10.0;
        let offset_z = -5.0 + rand::random::<f32>() * 10.0;
        // 如果挤压体太大或者太小，交给前端通过目标缩放处理，这里我们仅仅打散它们
        parsed_object.position = [offset_x, 0.0, offset_z];

        Ok(parsed_object)
    }
}

// 核心指令：对接大语言模型解析 3D 需求
#[tauri::command]
async fn interpret_dream(input: String, state: tauri::State<'_, AppState>) -> Result<SceneObject, String> {
    // 限制 Mutex 锁的作用域，避免跨越 await 点导致 Future not Send 错误
    {
        let mut count = state.call_count.lock().unwrap();
        *count += 1;
    }

    let api_key = state.gemini_api_key.clone();
    let interpreter = GeminiInterpreter { api_key };

    match interpreter.interpret(input).await {
        Ok(obj) => Ok(obj),
        Err(e) => {
            // LLM 回退容错：不报错中断，且写入控制台日志，返回白色半透明方块
            eprintln!("DreamInterpreter 解析失败, 即将走回退机制: {}", e);
            
            let offset_x = -4.0 + rand::random::<f32>() * 8.0;
            let offset_z = -4.0 + rand::random::<f32>() * 8.0;

            let fallback = SceneObject {
                id: Uuid::new_v4().to_string(),
                geometry_type: "box".into(),
                color: "#ffffff".into(), // 白色
                position: [offset_x, 0.0, offset_z],
                scale: [1.2, 1.2, 1.2],
                points: vec![],
                lifespan: 15000, 
            };
            Ok(fallback)
        }
    }
}

// 初始化时读取配置
fn load_api_key() -> String {
    // 采用 include_str! 将 config.toml 在编译期直接打入跨平台二进制包，
    // 以解决 Android/iOS 等沙盒移动端环境运行时 fs 找不到文件的问题
    let file_content = include_str!("../../src-tauri/config.toml");
    
    if let Ok(config) = toml::from_str::<Config>(file_content) {
        return config.gemini_api_key;
    }
    
    eprintln!("警告: 找不到有效的 config.toml，未加载 Gemini API 密钥。");
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
