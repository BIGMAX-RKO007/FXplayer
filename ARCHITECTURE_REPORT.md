# 🌌 生成式 3D "Dreaming" 引擎 - 架构与工程状态报告

> **最后更新**：2026-03-30 | 版本：v0.4 - 参数化曲线时代

本报告概述了 Tauri + React + R3F 引擎的当期完整工程快照，覆盖 Gemini AI 集成、参数化几何渲染以及跨平台 Android 兼容修复。

---

## 🛠 一、 技术栈清单 (Tech Stack)

### 前端生态 (Frontend)
| 依赖 | 版本 | 用途 |
| :--- | :--- | :--- |
| React | 19.x | 核心 UI 框架 |
| Vite | 7.x | 开发服务器与构建工具 |
| Three.js | 0.183.x | WebGL 底层 3D 渲染引擎 |
| `@react-three/fiber` | latest | React 声明式 WebGL 桥接层 |
| `@react-three/drei` | latest | 环境光、接触阴影、轨道控制器等工具集 |
| `lucide-react` | latest | SVG 图标组件库 |

### 后端生态 (Tauri & Rust)
| 依赖 | 特性 | 用途 |
| :--- | :--- | :--- |
| Tauri | v2.0 | 跨端桌面 / 移动原生打包框架 |
| `reqwest` | `rustls-tls` | Android 兼容的 HTTPS 网络请求（避免 OpenSSL 依赖） |
| `serde` + `serde_json` | `derive` | 前后端通信契约的序列化反序列化 |
| `toml` | - | 从 `config.toml` 读取 API Key 配置隔离 |
| `uuid` | `v4` | 为每个场景实体生成唯一 ID |
| `rand` | - | 随机散点坐标生成（防重叠机制） |

### AI 模型层
- **当前模型**：`gemini-2.5-flash`（通过 REST API 直连 `generativelanguage.googleapis.com`）
- **系统角色**：3D 建模师 — 接受自然语言输入，**必须**输出含二维曲线点集 (`points`) 的 JSON

---

## 📂 二、 文件映射表 (File Map)

### 后端核心 (`src-tauri/`)
| 文件 | 职责 |
| :--- | :--- |
| `src/main.rs` | Tauri 执行入口，仅调用 `lib::run()`。 |
| `src/lib.rs` | **系统大脑**。定义 `SceneObject` 数据契约（含 `points` 向量池）；实现 `DreamInterpreter` trait 与 `GeminiInterpreter`；执行 JSON 清洗、容错降级、散点坐标注入；通过 `include_str!` 在编译期嵌入 API Key。 |
| `config.toml` | API Key 存储（已加入 `.gitignore`，绝不提交远端）。 |
| `tauri.conf.json` | 原生跨平台配置。设定 `theme: Dark` 与 `backgroundColor` 规避 Android 安全区白边。 |
| `Cargo.toml` | Rust 依赖声明，包含 `reqwest/rustls-tls`、`toml`、`rand`、`uuid`。 |

### 前端核心 (`src/`)
| 文件 | 职责 |
| :--- | :--- |
| `App.tsx` | **主视图控制器**。承载 R3F 全屏 Canvas，管理 `objects[]` 状态数组，处理 Tauri `invoke` 的异步 IPC 通信。加入 `isMobile` 检测，动态关闭 Android 端的阴影渲染管线。 |
| `components/ObjectRenderer.tsx` | **WebGL 渲染单元**。支持全部五种几何体类型；用 `useMemo` 缓存 `LatheGeometry` 向量运算与 `ExtrudeGeometry` 截面路径构建；实现生命周期全流程（出生缩放→自转→退场收缩→显存回收）。 |
| `index.css` | CSS 全局重置。`touch-action: none` 禁止移动端手势干扰；背景色与 Tauri 原生底层保持一致。 |
| `App.css` | 样式核心。底部命令栏、Glassmorphism 磨砂效果、输入框与按钮的深色紫罗兰风格。 |
| `index.html` | 注入 `viewport-fit=cover, user-scalable=no`，适配 Android 刘海屏与防手势缩放。 |

---

## 🔄 三、 核心逻辑流 (Logic Flow)

```
用户输入自然语言
       ↓
App.tsx: invoke("interpret_dream", { input })
       ↓
lib.rs: GeminiInterpreter::interpret()
  ├─ 发送 HTTPS POST → gemini-2.5-flash
  ├─ 剥离 Markdown ```json 包壳
  ├─ serde_json 反序列化 → SceneObject
  ├─ 注入随机 UUID 和 lifespan（5~20秒）
  ├─ 【防重叠】强制覆写 position 为 [-5~5, 0, -5~5] 随机散点
  └─ 失败 → Fallback 白色方块（散列坐标，不中断前端）
       ↓
App.tsx: setObjects([...prev, newObj])
       ↓
ObjectRenderer.tsx: 根据 geometryType 挂载:
  ├─ "lathe"   → useMemo → THREE.Vector2[] → <latheGeometry args={[points, 32]}>
  ├─ "extrude" → useMemo → THREE.Shape (moveTo/lineTo) → <extrudeGeometry>
  └─ "box"     → <boxGeometry>（Fallback 兼容）
       ↓
useFrame: lerp 出生放大 → 自转 → 倒计时 → 退场收缩 → onExpire() → 显存回收
```

---

## 🎨 四、 几何体系统详解

### 支持的几何体类型
| 类型 | `geometryType` | 生成方式 | AI 创作原理 |
| :--- | :--- | :--- | :--- |
| 旋转体 | `"lathe"` | `THREE.LatheGeometry` | AI 提供右侧 X≥0 的纵截面轮廓点，Three.js 绕 Y 轴旋转 360° 生成实体 |
| 挤压体 | `"extrude"` | `THREE.ExtrudeGeometry` | AI 提供 XY 平面闭合多边形路径，Three.js 沿 Z 轴拉伸并倒角 |
| 方块 *(Fallback)* | `"box"` | `BoxGeometry` | Fallback 容错专用 |
| 球体 *(Legacy)* | `"sphere"` | `SphereGeometry` | 保留以向后兼容 |
| 圆环 *(Legacy)* | `"torus"` | `TorusGeometry` | 保留以向后兼容 |

### SceneObject 数据契约 (前后端通信协议)
```json
{
  "id": "uuid-v4",
  "geometryType": "lathe" | "extrude" | "box",
  "color": "#FF6B35",
  "position": [-3.2, 0.0, 1.8],
  "scale": [1.0, 1.0, 1.0],
  "points": [[0.0, -1.0], [0.4, -0.5], [0.6, 0.0], [0.4, 0.8], [0.0, 1.2]],
  "lifespan": 12000
}
```

---

## 📱 五、 Android 兼容修复记录

| 问题 | 根因 | 解决方案 |
| :--- | :--- | :--- |
| API Key 丢失 (`403 PERMISSION_DENIED`) | Android 沙盒环境 `fs::read_to_string` 无法定位宿主文件 | 改用 `include_str!("../../src-tauri/config.toml")` 在**编译期**将 Key 嵌入二进制包 |
| WebGL `GL_INVALID_OPERATION` 阴影错误 | `GL_RGBA16F_EXT`（HDR 纹理）与 `GL_SAMPLER_2D_SHADOW_EXT`（阴影采样器）在 Android GLES 驱动格式不兼容 | `isMobile` 检测后：`shadows={false}`、`castShadow={false}`、跳过 `<ContactShadows>`；`ambientLight` 提升至 `0.6` 补偿亮度 |
| 白边（顶部/底部/左侧） | Android 导航栏与状态栏透视底层窗体默认白色 | `tauri.conf.json` 设定 `theme: "Dark"` + `backgroundColor: [15,17,21,255]` |
| 触控手势干扰 | Web 默认手势（pinch 缩放、拖拽刷新）与 OrbitControls 冲突 | `index.html` 注入 `user-scalable=no, viewport-fit=cover`；`index.css` 设定 `touch-action: none` |

---

## 🔧 六、 调试与扩展指南 (Dev Guide)

**Q：如何为 Lathe 几何体增加更多点位细分以提升曲线精度？**
- 修改 `ObjectRenderer.tsx` 中 `<latheGeometry args={[lathePoints, 32]} />` 的第二个参数（径向切割段数），数字越大越圆滑（建议 32~64，移动端降至 16 以节省 GPU）。

**Q：如何增加新的 AI 可生成几何体类型（如管道 / TubeGeometry）？**
1. 在 `lib.rs` 的系统提示词 `system_instruction` 中向 `geometryType` 枚举值加入 `"tube"`。
2. 在 `ObjectRenderer.tsx` 的 `useMemo` 区块中处理 `"tube"` 分支，构建三维路径 `THREE.CatmullRomCurve3` 并渲染 `<tubeGeometry>`。

**Q：如何修改 Fallback 白色方块的默认材质？**
- 在 `lib.rs` 的 `interpret_dream` 错误分支中，修改 `fallback` 实例的 `color`、`scale` 字段即可。

---

## 🗺 七、 Roadmap 与风险点

### ✅ 已解决
- [x] **内存防 OOM**：`lifespan` + `useFrame lerp` 全生命周期自动回收机制
- [x] **Gemini AI 集成**：`GeminiInterpreter` + Fallback 双重防护
- [x] **参数化几何引擎**：Lathe / Extrude 真正的 AI 向量驱动建模
- [x] **防物体重叠**：Rust 端强制随机散点坐标接管
- [x] **Android API Key 问题**：`include_str!` 编译期嵌入修复
- [x] **Android WebGL 阴影崩溃**：`isMobile` 动态关闭不兼容的渲染管线

### ⚠️ 当前风险点
- **AI 几何精度上限**：大模型对复杂 3D 轮廓的坐标计算能力存在固有限制。苹果或人脸类复杂轮廓可能呈现"抽象派"效果，属于技术边界现象。
- **API 配额管理**：`gemini-2.5-flash` 调用受账户额度限制，高频使用需监控配额消耗。
- **Android 网络环境**：`rustls-tls` 已解决大多数证书问题；极端企业网络环境（如中间人代理）下可能仍需配置自定义证书验证。

### 🔮 下一阶段方向
- **多几何体组合**：允许一次 Prompt 生成多个组合实体（如"苹果树"= 苹果 × N + 树干 × 1）
- **场景记忆上下文**：将当前场景物体列表注入每次 AI 请求，使模型能感知已有物体的位置并主动避让
- **GLTF 资产集成**：对接 3D 模型库 API，在 AI 判断需要时动态加载真实 `.glb` 资产文件
