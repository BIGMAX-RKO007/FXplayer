# 🌌 生成式 3D "Dreaming" 引擎 - 架构与工程状态报告

> **协作说明**：本文件由团队共同维护，**每次修改代码后必须同步更新本文档**，写明日期、修改人、修改文件、修改内容及原因。

---

## 📋 变更日志 (Changelog) — 按时间倒序

---

### 🗓 2026-03-30 — 模块一+二：本地资产库 & 场景状态感知数据流（第二阶段重构开端）

**修改人**：Antigravity (AI)  
**背景**：用户决定将"造梦引擎"升级为第二阶段，引入本地 GLTF 资产库和 AI 场景状态感知能力。本次实现前两个子模块：**模块一**（素材库 UI 与场景管理）和**模块二**（前端到后端的场景快照数据流）。模块三（AI 环境感知 Prompt + 动作剧本返回）留待下一次实现。

#### 新增文件

| 文件路径 | 类型 | 说明 |
| :--- | :--- | :--- |
| `src/types/scene.ts` | **新建** | 统一类型系统（全项目核心）。定义 `AISceneObject`（AI 参数化几何物体）、`AssetSceneObject`（GLB 资产物体）、`SceneObject`（联合类型）、`AssetDefinition`（资产注册表类型）、`SceneSnapshot`（场景快照）、`ActionScript`（模块三预留的动作剧本类型）。 |
| `src/data/assets.ts` | **新建** | 本地资产静态注册表。`ASSET_LIBRARY` 数组中注册了两个资产：`grass.glb`（静态地块，无动画）和 `player.glb`（玩家角色，支持 `idle/run/jump` 三个动画 clip）。提供 `findAsset(id)` 查找函数。新增资产只需向数组追加一条记录即可被 UI 自动识别。 |
| `src/components/ModelRenderer.tsx` | **新建** | GLB 资产渲染器。使用 `@react-three/drei` 的 `useGLTF` 加载模型（带 `useGLTF.preload` 预加载避免首次点击卡顿），`useAnimations` 绑定动画混合器到 `groupRef`。支持：默认播放 `idle` 动画；响应外部 `currentAnimation` prop 变化进行 `fadeOut/fadeIn` 平滑过渡（模块三动作剧本会通过此 prop 驱动）；`scene.clone(true)` 支持多实例互不干扰；`onReady` 回调向上报告可用动画列表。 |
| `src/components/AssetLibraryPanel.tsx` | **新建** | 素材库浮层面板。顶部标题栏 + Scale 滑块（0.1×～5.0×）+ 每个资产一行卡片（图标 / 名称 / 描述 / 动画标签 / 添加按钮）。点击"+"触发 `onAddAsset(asset, scale)` 回调，按钮短暂变为"✓"提供触觉反馈。 |

#### 修改文件

**`src/types/scene.ts`（新建，见上）**

**`src/components/ObjectRenderer.tsx`**
- 移除内部的 `SceneObject` interface 定义，改为从 `src/types/scene.ts` 导入 `AISceneObject`
- 函数签名从 `{ object: SceneObject }` 改为 `{ object: AISceneObject }`
- 保留 `export type { AISceneObject as SceneObject }` 向后兼容，防止旧的 import 语句报错

**`src/App.tsx`（整体重写）**
- **统一场景状态**：原有的 `objects: OldSceneObject[]` 替换为 `sceneObjects: SceneObject[]`（`SceneObject` 为 `AISceneObject | AssetSceneObject` 联合类型），一个数组统管全部场景物体
- **防重叠网格分配器**：`getNextPosition(currentObjects)` 函数维护 `GRID_POSITIONS` 预定义格点数组（9 个格点覆盖 [-4,4] 范围），超出后随机扩展至 [-10,10] 区域，确保每个新物体都有不与已有物体重叠的独立落点
- **`addAssetToScene(assetDef, scale)`**：模块一核心函数。构造 `AssetSceneObject`（带唯一 UUID、类型标记 `source:'glb-asset'`、资产路径、初始动画等），调用 `getNextPosition` 分配落点，追加至 `sceneObjects` 触发渲染
- **`getSceneSnapshot(sceneObjects)`**：模块二核心函数。将 `sceneObjects` 序列化为轻量 `SceneSnapshot` JSON（只包含 `id/source/assetName/geometryType/position/scale/currentAnimation`，省略冗余的 `points` 等大字段），供 AI 理解当前场景状态
- **`generateObject()`（AI 生成流程升级）**：在调用 AI 前先执行 `getSceneSnapshot()`，将快照 JSON 与用户输入一起通过 `invoke("interpret_dream", { input, sceneSnapshot })` 发给后端。日志系统会分别打印快照字符数和快照内容到 `[UI/SNAPSHOT]` 分类下
- **双路渲染逻辑**：Canvas 内部判断 `obj.source === 'glb-asset'` 分别渲染 `<ModelRenderer>` 或 `<ObjectRenderer>`，两者可共存于同一场景
- **新增 UI 元素**：顶部场景计数器（显示"X 个资产 · Y 个 AI 物体"）；底部命令栏新增绿色 📦 Package 图标素材库按钮，点击切换 `showLibrary` 状态渲染 `<AssetLibraryPanel>`

**`src/App.css`**
- 新增 `.scene-counter` — 顶部居中的物体计数浮标
- 新增 `.library-toggle-btn / .library-toggle-btn.active` — 绿色调（`#34d399`）素材库按钮，与紫色日志按钮形成色彩区分
- 新增 `.library-overlay` — 固定定位浮层容器，`bottom:120px` 确保不遮挡命令栏
- 新增整套素材库面板 CSS：`.asset-library-panel`（Glassmorphism，绿色主题）、`.asset-scale-slider`（自定义滑块样式）、`.asset-card`（行卡片布局）、`.asset-anim-badge`（紫色动画标签徽章）、`.asset-add-btn`（绿色带 hover 发光效果的添加按钮）
- 新增 `@keyframes lib-slide-up` 面板出现动画（与日志面板的 `log-slide-up` 保持设计一致性）

**`src-tauri/src/lib.rs`**
- `interpret_dream` 命令签名新增 `scene_snapshot: Option<String>` 参数（放在 `input` 之后，`state` 之前）
- Tauri 自动从 invoke payload 中反序列化该字段；前端不传时 Rust 收到 `None`
- 新增日志打点：
  - `[SCENE/SNAPSHOT] INFO` — 收到快照时打印字符数并提示"待模块三启用"
  - `[SCENE/SNAPSHOT] DEBUG` — 打印快照内容前 300 字符
  - `[SCENE/SNAPSHOT] DEBUG` — 未传快照时记录原因

#### 待完成（模块三）
- 模块三已于 2026-03-30 晚上完成，见下文记录。

---

### 🗓 2026-03-30 — 模块三：AI 环境感知闭环与剧本执行引擎（第二阶段完结）

**修改人**：Antigravity (AI)  
**背景**：打通了"造梦引擎"的最后一步，将原先"单向"的创造流程，转变为"具备环境感知、能进行对象操控"的双向闭环。AI （Gemini）从"只能造物"升级为可以调配舞台的**"梦境导演"**。它输出包含一系列步骤的动作剧本 (`ActionScript`) 给前端执行，前端负责具体的动画状态机和基于恒定速度的平滑位移。

#### 核心修改

**`src/types/scene.ts`**
- 重构了 `ActionScript` 的 TypeScript 定义，提供与 Rust 协议层的映射，包含执行所需的字段如 `targetId, action, position` 以及服务端注入的 `id, lifespan`。
- 向 `AISceneObject` 与 `AssetSceneObject` 都增加了 `targetPosition?: [number, number, number]` 字段，用于在前端驱动对象的平移过渡逻辑。

**`src-tauri/src/lib.rs` (Rust 后端重构)**
- **数据契约重构**：新建了 `ActionScript` struct 用于反序列化 AI 结果中的剧本数组。
- **返回值变更**：将 `DreamInterpreter::interpret` 及其 Tauri 命令的返回值变更为 `Result<Vec<ActionScript>, String>`。
- **环境感知注入**：更新了 `system_instruction`，正式把 `scene_snapshot` 内容传给大模型，并将大模型返回结构限制为带 `spawn, moveTo, playAnimation, remove` 这些原力指令的 `ActionScript` List。

**`src/components/ModelRenderer.tsx` (动画装态机与平滑移动接管)**
- **废弃外部强制覆盖动画**：在内部托管了一个名为 `internalAnim` 的状态，以接管由物理或脚本带来的动画变化（如跑动时自动切 `run`，停下自动切返回）。
- **Slerp 自动朝向**：在 `useFrame` 中，计算当前坐标与 `targetPosition` 差值，通过 `Matrix4.lookAt -> Quaternion.slerp` 实现视觉平滑顺滑转向。
- **基于恒定速度的持续位移**：引入了纯前端恒定速度 `2 m/s` 的步长，不再依赖从后端获取动画耗时，彻底解决大步幅产生的"滑步"。

**`src/App.tsx` (顶层调度器)**
- 重构了 `generateObject`，反序列化 `ActionScript[]`。
- 引入了动作剧本遍历循环：对于 `spawn` 新建对象并推入 `SceneObjects`；对于 `moveTo` 和 `playAnimation` 到 `SceneObjects` 寻找对象并更新状态；对于 `remove` 将对应 targetId 剔除。
- 前端 `executeActionScript()` 函数解析剧本并更新 `sceneObjects` 中对应物体的 `position` 和 `currentAnimation`

---

### 🗓 2026-03-30 — 全链路 Runtime Log 系统

**修改人**：Antigravity (AI)  
**背景**：随着 Gemini AI 集成引入了网络请求、JSON 解析、WebGL 渲染等多个复杂环节，诊断问题时缺乏可观测性。本次新增了覆盖前后端全链路的日志追踪系统，支持在应用内实时查看每个步骤的运行状态。

#### 新增文件

| 文件路径 | 类型 | 说明 |
| :--- | :--- | :--- |
| `src/utils/logger.ts` | **新建** | 前端日志基础设施。定义 `LogEntry`、`LogLevel`、`LogContextType` 类型；创建 `LogContext`（React Context）；导出 `useLogger()` hook 和 `createLogEntry()` 工厂函数。最多保留 500 条日志（环形缓冲）。 |
| `src/components/LogPanel.tsx` | **新建** | 运行时控制台浮层 UI 组件。接收 `onClose` prop；自动滚动到最新日志；按 `level` 分色展示（蓝=info / 绿=success / 黄=warn / 红=error / 紫=debug）；每行包含 `时间戳 / [STAGE] / LEVEL / 消息` 四列；带 Clear 和 Close 按钮。 |

#### 修改文件

**`src-tauri/src/lib.rs`**
- 新增 `use tauri::Emitter;` 导入（必须显式引入才能调用 `AppHandle::emit`）
- 新增 `LogEvent { level, stage, message }` 结构体，派生 `Clone + Serialize`
- 新增 `emit_log(app, level, stage, message)` 辅助函数：同时通过 Tauri 事件总线推送到前端 AND 打印到 `stderr`（adb logcat / cargo tauri dev 均可见）
- `GeminiInterpreter` 结构体新增 `app_handle: tauri::AppHandle` 字段
- `GeminiInterpreter` 新增 `log()` 便捷方法
- `interpret_dream` 命令签名新增 `app_handle: tauri::AppHandle` 参数（Tauri 框架自动注入）
- **日志打点覆盖以下所有节点**：
  1. `[INVOKE]` — 收到前端指令，打印 input 内容
  2. `[RUST/STATE]` — 打印调用计数、API Key 是否有效
  3. `[RUST/INTERPRETER]` — GeminiInterpreter 实例创建
  4. `[GEMINI/REQ]` — 打印脱敏后的 API 端点 URL（Key 首6位+末4位）
  5. `[GEMINI/REQ_BODY]` — 打印 system_instruction 长度 + 用户 prompt
  6. `[GEMINI/HTTP]` — "正在发送 HTTPS POST 请求…"
  7. `[GEMINI/HTTP]` — 收到 HTTP 响应状态码（如 200 OK / 403 / 404）
  8. `[GEMINI/RESP_BODY]` — 响应体前 300 字符预览
  9. `[GEMINI/PARSE]` — JSON 外壳解析开始
  10. `[GEMINI/PARSE]` — API 原生 error 报错（若有）
  11. `[GEMINI/CONTENT]` — 提取到模型文本的字符数
  12. `[GEMINI/CLEAN]` — Markdown 代码块剥离前后的字符数对比
  13. `[GEMINI/DESERIALIZE]` — serde 反序列化开始
  14. `[GEMINI/DESERIALIZE]` — 反序列化成功：打印 geometryType / color / points 数量
  15. `[RUST/INJECT]` — UUID 注入 + lifespan 赋值
  16. `[RUST/COORDS]` — 坐标散点覆写（防重叠）
  17. `[INVOKE/FALLBACK]` — Fallback 触发原因（若解析失败）
  18. `[INVOKE]` — 最终返回前端成功

**`src/App.tsx`**
- 引入 `listen` from `@tauri-apps/api/event`，在 `useEffect` 中监听后端推送的 `dream-log` 事件，实时注入前端日志数组
- 引入 `LogContext`、`LogEntry`、`LogLevel`、`createLogEntry`、`LogPanel`
- 新增 `logs: LogEntry[]` state 和 `addLog() / clearLogs()` 回调（`useCallback` 优化）
- 用 `<LogContext.Provider value={{ logs, addLog, clearLogs }}>` 包裹整个应用树，使任意子组件可通过 `useLogger()` 写日志
- **前端日志打点**：
  1. `[UI/INIT]` — 应用初始化完成、平台检测结果
  2. `[UI/CLICK]` — 用户点击 Spawn 按钮时记录 input 内容
  3. `[UI/INVOKE]` — 调用 Tauri IPC（`invoke("interpret_dream")`）
  4. `[UI/RESPONSE]` — 收到后端 SceneObject（打印 id/type/color/points数量/lifespan）
  5. `[UI/RENDER]` — SceneObject 注入 objects[] 数组，触发 Re-render
  6. `[UI/SCENE]` — 清空场景时记录移除数量
  7. `[UI/GC]` — 对象 onExpire 回调（id + 原因）
- 底部命令栏新增 `<button className="log-toggle-btn">` Terminal 图标按钮
  - 按钮右上角显示日志条数数字角标（超过 99 显示"99+"）
  - 点击切换 `showLog` 状态，条件渲染 `<LogPanel>`

**`src/components/ObjectRenderer.tsx`**
- 引入 `useLogger` hook（来自 `../utils/logger`）
- `useEffect` 中新增以下打点：
  - `[UI/RENDER]` — 组件 mount 时打印 id / geometryType / color / points数量 / lifespan
  - `[UI/GEOMETRY]` — 若为参数化几何（lathe/extrude），打印控制点数量
  - `[UI/LIFECYCLE]` — shrinkTimer 触发时记录退场动画开始
  - `[UI/GC]` — removeTimer 触发时记录生命周期终止

**`src/App.css`**
- 新增 `.log-toggle-btn` 样式（紫色半透明按钮，active 状态发光）
- 新增 `.log-badge` 样式（角标，紫色圆形小徽章）
- 新增 `.log-panel-overlay` 样式（全屏透明浮层，pointer-events: none 防止阻挡 3D）
- 新增 `.log-panel` 样式（Glassmorphism 深色面板，blur(28px)，55vh 高度，slide-up 动画）
- 新增日志面板相关所有子样式：`.log-panel-header / .log-panel-title / .log-count / .log-panel-actions / .log-action-btn / .log-body / .log-entry / .log-ts / .log-stage / .log-level / .log-message / .log-empty`
- 自定义滚动条样式（4px 宽，紫色，透明轨道）
- 移动端响应式适配（`@media max-width: 480px`）

---

### 🗓 2026-03-30 — Android WebGL 兼容修复

**修改人**：Antigravity (AI)  
**背景**：Android 真机运行时出现两个严重 Bug，导致 AI 生成功能完全不可用。

#### Bug ① — API 403 PERMISSION_DENIED（Android）

**根因**：Android APK 是沙盒打包环境，运行时 `fs::read_to_string()` 无法定位宿主文件系统上的 `config.toml`，导致 API Key 读取失败，所有请求返回 403。

**修改文件**：`src-tauri/src/lib.rs`
- **删除**：`use std::fs;` 导入（不再使用）
- **删除**：`load_api_key()` 中基于 `["config.toml", "src-tauri/config.toml", ".."]` 的多路径遍历尝试读取逻辑
- **新增**：改用 Rust 宏 `include_str!("../../src-tauri/config.toml")`，在**编译期**将文件内容直接嵌入二进制可执行文件，彻底规避运行时路径问题

#### Bug ② — WebGL `GL_INVALID_OPERATION`（Android）

**根因**：`<Environment preset="studio" />` 内部使用 `GL_RGBA16F_EXT`（HDR 半浮点纹理格式），而 `<ContactShadows>` 和 `castShadow` 在 Android GLES 驱动中依赖 `GL_SAMPLER_2D_SHADOW_EXT`（阴影深度采样器），两者在 Android WebGL 的部分驱动版本中存在格式不兼容。

**修改文件**：`src/App.tsx`
- 在文件顶层新增 `const isMobile = /Android|webOS|.../.test(navigator.userAgent)` 运行时平台检测
- `<Canvas shadows={!isMobile}>` — 移动端关闭全局阴影渲染管线
- `<directionalLight castShadow={!isMobile}>` — 移动端不投射阴影
- `shadow-mapSize-width/height` — 桌面端 1024，移动端 512（降低 GPU 负担）
- `<ambientLight intensity={isMobile ? 0.6 : 0.2}>` — 移动端提升环境光强度补偿画面亮度
- `{!isMobile && <ContactShadows ...>}` — 移动端完全跳过接触阴影渲染

---

### 🗓 2026-03-30 — 参数化曲线几何引擎 + 防重叠散点

**修改人**：Antigravity (AI)  
**背景**：原有引擎只能从 box/sphere/torus 三种预设形状中选择，Gemini 无法体现真实 3D 建模能力。同时，所有物体默认生成在 `[0,0,0]` 导致穿模堆叠。

#### 几何体系统重构

**修改文件**：`src-tauri/src/lib.rs`
- `SceneObject` 结构体新增 `points: Vec<[f32; 2]>` 字段（带 `#[serde(default)]`），用于接收 AI 返回的二维坐标点序列
- 彻底重写 `system_instruction` Prompt（废弃 box/sphere/torus 选择题），强制 AI：
  - **轴对称物体**（苹果、杯子）→ 必须选 `"lathe"`，提供右侧 X≥0 纵截面轮廓点（6~15个点）
  - **异形截面物体**（香蕉、星星）→ 必须选 `"extrude"`，提供 XY 平面完整闭合路径点

**修改文件**：`src/components/ObjectRenderer.tsx`
- TypeScript 接口 `SceneObject` 新增 `points?: [number, number][]`
- 引入 `useMemo` hook（缓存昂贵的几何计算，防止无关 Re-render 重复计算顶点）
- **Lathe 几何**：`useMemo` 将 `points` 数组映射为 `THREE.Vector2[]`，通过 `<latheGeometry args={[vectors, 32]} />` 渲染（32段平滑切割）
- **Extrude 几何**：`useMemo` 实例化 `THREE.Shape()`，首点 `moveTo`，循环 `lineTo`，强制首尾闭合；通过 `<extrudeGeometry args={[shape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.1 }]} />` 渲染
- 保留 `box/sphere/torus` 原始几何作为 Fallback 兼容分支

#### 防重叠坐标接管

**修改文件**：`src-tauri/src/lib.rs`
- 解析成功后，强制覆写 AI 返回的 `position` 字段：
  - `offset_x = -5.0 + rand::random::<f32>() * 10.0`（范围 [-5, 5]）
  - `offset_z = -5.0 + rand::random::<f32>() * 10.0`（范围 [-5, 5]）
- Fallback 白块同样使用 `[-4, 4]` 范围的随机散点坐标

---

### 🗓 2026-03-29 — Gemini 2.5 Flash 模型升级

**修改人**：Antigravity (AI)  
**背景**：调试发现 `gemini-1.5-flash` 对当前 API Key 在 `v1beta` 端口已返回 404 Not Found，通过 `ListModels` 接口枚举确认可用模型后升级。

**修改文件**：`src-tauri/src/lib.rs`
- API 端点从 `gemini-1.5-flash` 更新为 **`gemini-2.5-flash`**

---

### 🗓 2026-03-29 — Gemini AI 语义解析引擎集成

**修改人**：Antigravity (AI)  
**背景**：将"梦境引擎"从随机几何体生成升级为 AI 语义驱动，实现"用户说什么，AI 就生成什么"的核心体验。

**修改文件**：`src-tauri/Cargo.toml`
- 新增 `reqwest` 依赖，启用 `json` + `rustls-tls` features（后者为 Android 适配，避免 OpenSSL 依赖）
- 新增 `toml` 依赖（配置文件读取）
- 新增 `uuid` 依赖，启用 `v4` feature
- 新增 `rand` 依赖

**修改文件**：`src-tauri/src/lib.rs`（整体重构）
- `AppState` 结构体：除计数器外，新增 `gemini_api_key: String` 字段
- 新增 `Config` 结构体用于 toml 反序列化
- 新增 `DreamInterpreter` trait（抽象 LLM 解析器接口，便于未来切换本地模型）
- 新增 `GeminiInterpreter` 实现（核心 HTTPS 网络请求层）：
  - 构建 `system_instruction` System Prompt
  - 通过 `reqwest` 发送 POST 请求
  - **JSON 鲁棒清洗**：自动剥离 ` ```json ` 等 Markdown 包壳
  - **serde 强类型反序列化**至 `SceneObject`
  - 强制注入 UUID 和随机 `lifespan`（5000~20000ms）
- 新增 `interpret_dream` Tauri 命令（替换旧的 `generate_3d_object`）
- 新增 `load_api_key()` 函数（从 `config.toml` 安全读取 API Key）
- **Fallback 容错机制**：解析失败时返回白色半透明方块，不中断前端

**修改文件**：`src/App.tsx`
- `invoke` 调用目标从 `generate_3d_object` 切换为 `interpret_dream`
- 新增 `isGenerating` 状态，按钮在 AI 思考时显示"..."并禁用

**新增文件**：`src-tauri/config.toml`
- 存储 Gemini API Key，格式：`gemini_api_key = "AIzaSy..."`
- **已加入 `.gitignore`，绝对不可提交至远端仓库**

---

### 🗓 2026-03-29 — 对象生命周期 & 显存自动回收

**修改人**：Antigravity (AI)  
**背景**：频繁生成对象会导致 Three.js Scene 积累大量 Geometry/Material，在移动端导致 OOM。

**修改文件**：`src-tauri/src/lib.rs`
- `SceneObject` 新增 `lifespan: u64` 字段（毫秒，带 `#[serde(default)]`）
- 每次生成随机赋值 5000~20000ms

**修改文件**：`src/components/ObjectRenderer.tsx`（整体重构）
- 新增 `isDying` 状态标位
- `useEffect` 注册双重定时器：
  - `shrinkTimer`（lifespan - 600ms）：触发 `isDying = true`，启动缩小退场动画
  - `removeTimer`（lifespan）：调用 `onExpire(id)`，从 React 树移除 → Three.js GC 回收显存
- `useFrame` 使用 `lerp` 实现：出生时从 `[0,0,0]` 平滑放大至目标尺寸；死亡时平滑收缩回 `[0,0,0]`

**修改文件**：`src/App.tsx`
- `removeObject(id)` 回调：使用 `filter` 从 `objects[]` 中移除，触发 Re-render 卸载对应 ObjectRenderer

---

### 🗓 2026-03-29 — Android 白边修复 & 输入框重构

**修改人**：Antigravity (AI)  
**背景**：Android 端顶部和底部出现白边；底部按钮文字"Director"语义不清。

**修改文件**：`src-tauri/tauri.conf.json`
- 新增 `"theme": "Dark"` — 强制原生窗体使用深色主题，规避系统导航栏默认白色透显
- 新增 `"backgroundColor": [15, 17, 21, 255]` — 与应用背景色 `#0f1115` 对齐，消除白边

**修改文件**：`src/index.html`
- Viewport meta 标签新增 `viewport-fit=cover`（适配刘海屏安全区）
- 新增 `user-scalable=no`（禁止双指缩放）

**修改文件**：`src/index.css`
- 全局 `touch-action: none`（禁止拖拽刷新和手势干扰）
- `height: 100dvh`（动态视口高度，适配移动端工具栏展开/收起）

**修改文件**：`src/App.tsx`
- 移除页面顶部的"Entities Active"计步器
- 将底部的 Director 功能按钮重构为 `<input type="text">` 文字输入框
- 将表单使用 `onSubmit` 进行整合，支持回车键直接触发生成

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
| `lucide-react` | latest | SVG 图标组件库（Sparkles / Trash2 / Terminal） |

### 后端生态 (Tauri & Rust)
| 依赖 | 特性 | 用途 |
| :--- | :--- | :--- |
| Tauri | v2.0 | 跨端桌面 / 移动原生打包框架 |
| `reqwest` | `rustls-tls`, `json` | Android 兼容的 HTTPS 网络请求 |
| `serde` + `serde_json` | `derive` | 前后端通信契约序列化 |
| `toml` | - | `config.toml` API Key 读取 |
| `uuid` | `v4` | 实体唯一 ID 生成 |
| `rand` | - | 随机散点坐标（防重叠）、随机 lifespan |

### AI 模型层
- **当前模型**：`gemini-2.5-flash`（REST API，`v1beta` 端点）
- **角色设定**：硬核 3D 建模师，强制输出 `lathe`/`extrude` 类型和 `points` 二维坐标点序列

---

## 📂 二、 文件映射表 (File Map)

### 后端核心 (`src-tauri/`)
| 文件 | 职责 |
| :--- | :--- |
| `src/main.rs` | Tauri 执行入口，仅调用 `lib::run()`。 |
| `src/lib.rs` | **系统大脑**。日志事件定义 (`LogEvent`)；`SceneObject` 数据契约（含 `points`）；`GeminiInterpreter`（HTTPS 请求 + 全链路日志）；坐标散点接管（防重叠）；Fallback 容错。 |
| `config.toml` | API Key 存储（**已加入 `.gitignore`，绝不提交**）。 |
| `tauri.conf.json` | 原生跨平台配置。`theme: Dark` 解决 Android 白边。 |
| `Cargo.toml` | Rust 依赖声明。 |

### 前端核心 (`src/`)
| 文件 | 职责 |
| :--- | :--- |
| `App.tsx` | 主视图控制器。管理 `objects[]` 和 `logs[]` 状态；`LogContext.Provider` 根节点；监听后端 `dream-log` Tauri 事件；`isMobile` 检测动态调整渲染管线。 |
| `utils/logger.ts` | 前端日志基础设施。`LogContext`、`LogEntry` 类型、`useLogger()` hook。 |
| `components/ObjectRenderer.tsx` | **WebGL 渲染单元**。五种几何体支持；`useMemo` 缓存参数化几何计算；完整生命周期管理 + GC 回收；`useLogger()` 生命周期打点。 |
| `components/LogPanel.tsx` | 运行时控制台 UI。Glassmorphism 浮层，彩色分级，自动滚底，500条环形缓冲。 |
| `index.css` | CSS 全局重置。`touch-action: none`，移动端适配。 |
| `App.css` | 样式核心。命令栏、日志按钮、日志面板完整 CSS。 |
| `index.html` | Viewport 配置（safe-area, no-scale）。 |

---

## 🔄 三、 完整数据流（含日志节点）

```
用户键入内容 → 点击 Spawn
  │
  ├── 前端打点: [UI/CLICK] 记录 input 内容
  │
  └── invoke("interpret_dream", { input })
        │
        ├── 前端打点: [UI/INVOKE]
        │
        └── Rust: interpret_dream(input, state, app_handle)
              │
              ├── [INVOKE] 收到指令 → emit → 前端
              ├── [RUST/STATE] 调用计数 + Key 状态 → emit
              ├── [RUST/INTERPRETER] 创建 GeminiInterpreter → emit
              │
              └── GeminiInterpreter::interpret(input)
                    │
                    ├── [GEMINI/REQ] 构建 URL（脱敏） → emit
                    ├── [GEMINI/REQ_BODY] 请求摘要 → emit
                    ├── [GEMINI/HTTP] "发送中…" → emit
                    │
                    ├── HTTPS POST → generativelanguage.googleapis.com
                    │
                    ├── [GEMINI/HTTP] HTTP 状态码 → emit
                    ├── [GEMINI/RESP_BODY] 响应体前300字符 → emit
                    ├── [GEMINI/PARSE] JSON 外壳解析 → emit
                    ├── [GEMINI/CONTENT] 提取文本字符数 → emit
                    ├── [GEMINI/CLEAN] Markdown 剥离 → emit
                    ├── [GEMINI/DESERIALIZE] SceneObject 反序列化 → emit
                    ├── [RUST/INJECT] UUID + lifespan 注入 → emit
                    └── [RUST/COORDS] 坐标散点覆写 → emit

              └─── Ok(SceneObject) 返回前端
                    │
                    ├── 前端打点: [UI/RESPONSE]
                    ├── setObjects([...prev, newObj])
                    ├── 前端打点: [UI/RENDER]
                    │
                    └── ObjectRenderer 挂载
                          ├── [UI/RENDER] mount 打点
                          ├── [UI/GEOMETRY] 参数化几何构建（若 lathe/extrude）
                          ├── useFrame: lerp 出生动画 + 自转
                          ├── [UI/LIFECYCLE] shrinkTimer → 退场动画
                          └── [UI/GC] removeTimer → onExpire → React 卸载 → Three.js GC
```

---

## 📱 四、 Android 兼容修复记录

| 日期 | 问题 | 根因 | 解决方案 |
| :--- | :--- | :--- | :--- |
| 2026-03-30 | `403 PERMISSION_DENIED`（API Key 丢失）| Android 沙盒 `fs` 无法读取宿主路径 | `include_str!` 编译期嵌入 |
| 2026-03-30 | WebGL `GL_INVALID_OPERATION` 阴影崩溃 | HDR 纹理格式与阴影采样器 GLES 不兼容 | `isMobile` 检测关闭阴影管线 |
| 2026-03-29 | 顶部/底部白边 | 原生窗口默认白色底壳透显 | `tauri.conf.json` 深色主题 + 匹配背景色 |
| 2026-03-29 | 触控手势干扰 3D | Web 默认 pinch-to-zoom / pull-to-refresh | `touch-action: none` + viewport meta |

---

## 🎨 五、 几何体支持矩阵

| 类型 | `geometryType` | Three.js 实现 | AI 生成策略 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| 旋转体 | `"lathe"` | `LatheGeometry(points, 32)` | AI 提供 X≥0 纵截面轮廓点 | ✅ 主力 |
| 挤压体 | `"extrude"` | `ExtrudeGeometry(shape, {depth:0.5,bevel})` | AI 提供 XY 平面闭合多边形路径 | ✅ 主力 |
| 方块 | `"box"` | `BoxGeometry` | Fallback 容错专用 | ✅ Fallback |
| 球体 | `"sphere"` | `SphereGeometry` | 保留旧版兼容 | ⚠️ Legacy |
| 圆环 | `"torus"` | `TorusGeometry` | 保留旧版兼容 | ⚠️ Legacy |

---

## 🗺 六、 Roadmap 与风险点

### ✅ 已解决
- [x] 内存防 OOM：lifespan 全生命周期回收
- [x] Gemini AI 集成：GeminiInterpreter + Fallback 双重防护
- [x] 参数化几何引擎：AI 向量驱动的 Lathe / Extrude 建模
- [x] 防物体重叠：Rust 端坐标散点接管
- [x] Android API Key 丢失：`include_str!` 修复
- [x] Android WebGL 阴影崩溃：isMobile 条件关闭
- [x] 全链路 Runtime Log：前后端日志系统 + 浮层控制台 UI

### ⚠️ 当前风险
- **AI 几何精度**：复杂轮廓（人脸、花卉）的坐标计算是模型能力上限，效果可能呈现抽象派风格
- **API 配额**：`gemini-2.5-flash` 调用受账户配额限制
- **config.toml 安全**：已加入 `.gitignore`，但务必确认每个开发者本地**不要**直接将密钥分享于聊天/issue

### 🔮 下一阶段方向
- **场景记忆上下文**：将当前 `objects[]` 坐标列表注入每次 AI 请求，让模型感知已有占位并主动避让
- **多对象一次生成**：允许单次 Prompt 生成多个组合实体（如"一片森林"= 树干×5 + 树冠×5）
- **GLTF 资产集成**：对接 3D 模型库 API，检测到简单描述时直接加载 `.glb` 文件
