use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use uuid::Uuid;

// 定义状态管理器中的计数器
struct AppState {
    call_count: Mutex<u32>,
}

// 通信协议对象：返回给前端的 3D 实体定义
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SceneObject {
    pub id: String,
    pub geometry_type: String, // "box" | "sphere" | "torus"
    pub color: String,
    pub position: [f32; 3],
    pub scale: [f32; 3],
    pub lifespan: u64, // 生命周期，毫秒
}

// 核心指令：生成 3D 对象
#[tauri::command]
fn generate_3d_object(input: String, state: tauri::State<'_, AppState>) -> Result<SceneObject, String> {
    let mut count = state.call_count.lock().map_err(|e| e.to_string())?;
    *count += 1;

    let id = Uuid::new_v4().to_string();

    let object = if *count == 1 {
        // 第一回：绿色方块
        SceneObject {
            id,
            geometry_type: "box".into(),
            color: "#2ecc71".into(), // 宝石绿
            position: [0.0, 0.0, 0.0],
            scale: [1.0, 1.0, 1.0],
            lifespan: 10000,
        }
    } else if *count == 2 {
        // 第二回：红色球体
        SceneObject {
            id,
            geometry_type: "sphere".into(),
            color: "#e74c3c".into(), // 珊瑚红
            position: [2.0, 0.0, 0.0],
            scale: [1.0, 1.0, 1.0],
            lifespan: 10000,
        }
    } else {
        // 第三回及以后：随机模式
        let shapes = ["box", "sphere", "torus"];
        let random_shape = shapes[rand::random::<usize>() % shapes.len()];

        let colors = ["#3498db", "#f1c40f", "#9b59b6", "#1abc9c", "#e67e22", "#ff6b81", "#ffffff", "#000000"];
        let random_color = colors[rand::random::<usize>() % colors.len()];

        // 随机位置：-4.0 到 4.0
        let pos_x = -4.0 + rand::random::<f32>() * 8.0;
        let pos_y = -3.0 + rand::random::<f32>() * 6.0;
        let pos_z = -4.0 + rand::random::<f32>() * 8.0;

        // 随机缩放：0.5 到 2.0
        let scale_val = 0.5 + rand::random::<f32>() * 1.5;

        // 随机寿命：5 到 15 秒
        let life_ms = 5000 + (rand::random::<f32>() * 10000.0) as u64;

        SceneObject {
            id,
            geometry_type: random_shape.into(),
            color: random_color.into(),
            position: [pos_x, pos_y, pos_z],
            scale: [scale_val, scale_val, scale_val],
            lifespan: life_ms,
        }
    };

    Ok(object)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            call_count: Mutex::new(0),
        })
        .invoke_handler(tauri::generate_handler![generate_3d_object])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
