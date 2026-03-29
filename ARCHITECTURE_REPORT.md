# 🌌 生成式 3D "Dreaming" 引擎 - 架构与工程状态报告

本报告概述了 Tauri + React + R3F 引擎在跨平台全屏、3D 渲染和原生兼容化重构后的当期工程快照。

---

## 🛠 一、 技术栈清单 (Tech Stack)

### 前端生态 (Frontend)
- **核心框架**：React 19.x (搭配 Vite 进行高速构建)
- **3D 渲染引擎**：Three.js (`three` v0.183.x)
- **React 桥接层**：`@react-three/fiber` (用于声明式构建 WebGL)
- **3D 辅助工具库**：`@react-three/drei` (提供环境光、接触阴影、摄像机轨道控制器)
- **UI 及图标组件**：`lucide-react` (SVG 矢量图形)

### 后端生态 (Tauri & Rust)
- **应用框架**：Tauri v2.0 (提供跨端桌面/移动原生打包)
- **序列化通信**：`serde` + `serde_json`
- **唯一标识符**：`uuid` (v1.23.0，启用 `v4` feature)
- **随机数生成器**：`rand` (v0.8.x，适配兼容 `Distribution` 语法)

---

## 📂 二、 文件映射表 (File Map)

架构采用典型的 Tauri 前后端分离结构，核心关键文件及其职责划分如下：

### 后端核心 (src-tauri)
| 文件名 | 职责与作用 |
| :--- | :--- |
| `src/main.rs` | Tauri 的执行入口点，仅负责调用 `lib::run()`。 |
| `src/lib.rs` | **业务中枢**。包含全局状态计数锁 (`AppState`) 的定义、通信层 `SceneObject` 的序列化/反序列化契约。同时定义和暴露了 Tauri 的核心后端指令 `generate_3d_object`。 |
| `tauri.conf.json` | Tauri 原生跨平台配置器。近期刚加入了 **Window 级别的 `theme` 和 `backgroundColor` 配置**，从而解决了跨端安全区或导航栏透视产生的异色白边。 |

### 前端核心 (src)
| 文件名 | 职责与作用 |
| :--- | :--- |
| `src/App.tsx` | **主视图与控制器**。承载了整个大屏的“导演”布局（上下 Z 轴绝对定位）。包含 React Three Fiber 全屏底垫（`<Canvas>`），包含悬浮在画布上方带有 Glassmorphism 的前端控制命令栏（事件层），处理与 Rust 的异步通信状态流转。 |
| `src/components/ObjectRenderer.tsx` | **渲染单元**。接收单个 `SceneObject` 的数据驱动（大小、类型、颜色），动态挂载对应的 Three.js 基本形态实体。负责通过 `useFrame` 维持逐帧更新的物理缓动及“出生放大缩放（Scale from `[0,0,0]`）”的平滑入场动画和自转动画。 |
| `src/index.css` | **CSS 重置**。禁止原生滚轮事件，通过全局设定防缩放机制和全屏深色背景 (`#0f1115`)，从根本上适配了移动端的拉拽免疫 (`touch-action: none`) 逻辑。 |
| `src/App.css` | **样式核心**。提供所有前端容器的绝对布局、FlexBOX 排版方案以及极具极简主义的高级 UI 特效（如输入框和底部命令控制条的深色磨砂与紫罗兰阴影渲染）。 |

---

## 🔄 三、 核心逻辑流 (Logic Flow)

系统的数据环路（从“意图”到“视觉”）运作如下：

1. **用户输入与事件**：用户在底部的 `<input>` 对话框中键入创意（如 "召唤一个宇宙"），点击 **Spawn (生成按钮)**，触发 `App.tsx` 中的 `generateObject()` 函数。
2. **前后端调用 (Tauri Invoke)**：前端利用 `@tauri-apps/api/core` 的 `invoke` 经系统内部 IPC 管道调用 Rust 层的 `"generate_3d_object"` 方法，并传入 `input` 字符串。
3. **Rust 状态获取**：Rust 通过 `tauri::State` 获取全局互斥锁 (`Mutex`), 增加累加器。
   - 若处于前 1/2 次互动，固定返回硬编码的特定颜色与物体（首测演示机制）。
   - >= 第 3 次，利用 `rand` 使用纯随机游走数据在 X/Y/Z 轴与材质颜色上挑选，并在堆上构建一个包含新生 UUID 标志位结构体 `SceneObject` 实例，将该 JSON 流返回至前端。
4. **前端状态注入与映射渲染**：
   - 包含新对象的 `SceneObject` 由 `useState` 追加至 React 数组中并发起 Re-render（不刷新重载整个 Web 页面，仅改变数组引用）。
   - `@react-three/fiber` 检测到 `objects.map` 内部数量新增，挂载一个新的 `<ObjectRenderer>` 节点到 WebGL Scene。
5. **全生命周期防 OOM（内存溢出）回收**：
   - `<ObjectRenderer>` 初始化自身的 Ref，并在 `<mesh>` 组件上指定初始状态为极小的隐形元素 (`scale=[0,0,0]`)，并利用 `useFrame` 开始 `lerp` 放大生长。
   - 利用新增的 `lifespan`（随机下发为 5~15 秒）在组件内注册倒计时：
     - **退场信号阶段**：结束前 600ms，触发 `isDying` 状态标位，引爆缩小至 `[0,0,0]` 的丝滑离场退缩插值渲染。
     - **核销终末阶段**：倒数彻底清零时，向上层抛出 `onExpire`，将其 React 内部引用 `filter` 筛除。随着 `<mesh>` 容器从 Virtual DOM 树被连根拔起，Three.js 的垃圾回收网络（GC）启动，安全有效地回收相应的 Material、Geometry 占据的客户端显存。
---

## 🔧 四、 调试与扩展指南 (Dev Guide)

**Q：如果我想修改物体在画面上的全局材质与环境颜色，去哪搞？**
- 修改单个物体的纹理质感：请前往 `src/components/ObjectRenderer.tsx` 的`<meshStandardMaterial>` 节点处，调整或增加 `metalness`（金属感）、`roughness`（粗糙度）、甚至是 `emissive` (霓虹发光)。
- 修改 R3F 全局环境曝光与阴影：在 `src/App.tsx` 内寻找 `<DirectionalLight>`、`<Environment preset="studio" />`（可以换成 `"city"`, `"sunset"` 等）或者 `<color attach="background" ...>` 来进行整景风格的更换。

**Q：如果我想增加新的几何体类型（如 Cone / 锥体）？**
1. 去 Rust 后端 (`src-tauri/src/lib.rs`)，在 `shapes` 数组白名单中压入新类型：`let shapes = ["box", "sphere", "torus", "cone"];`。
2. 去 React 渲染组件 (`src/components/ObjectRenderer.tsx`)：利用 JSX 语法的条件判断为其具象化。
   ```tsx
   {object.geometryType === 'cone' && <coneGeometry args={[0.5, 1, 32]} />}
   ```

**Q：针对目前安卓端适配的重点修改分别藏在哪？**
- **禁用手势缩放与拖拽刷新**：这常在 Web 手指拖拽控制视角时导致恶心抖动。通过向 `index.html` 注入了 `user-scalable=no, viewport-fit=cover` ，并在 `index.css` 全局阻碍 `touch-action: none` 来确保原生纯净感。
- **清除软安全区刘海造成的诡异白边**：通过原生级支持将 `tauri.conf.json` 修改为 `"theme": "Dark", "backgroundColor": [15, 17, 21, 255]` 来迫使底层窗体呈现黑色虚无，替代了默认的白色窗体底壳。

---

## 🗺 五、 待办与风险点 (Roadmap)

### 1. 硬编码局限 (Hardcoded Limitations)
目前物体的颜色是在 Rust 中定义的一组 `#Hex` 固定池（蓝，红，黄...）。随着之后加入 Ollama 大模型自然语义分析阶段，应放弃从库中随机选择，而转为将用户的 Prompt `"来一个红色的金字塔"` 解析并转换为对应的 `#FF0000` 并传下。

### 2. 精确命中规避了 OOM 性能黑洞 (Resolved Memory Risks)
~~目前的架构只执行“Spawn (增殖)”和“Reset Scene (全盘清空)”，而没有任何单独的回收与丢弃事件（Dispose event）。如果频繁请求生成实体，且无剔除不可见元素的手段，Three.js 的 Scene 图谱会无脑驻留过多面与顶点，最终造成移动设备上的帧率塌陷。~~
**已修复与优化**：现所有物体已被赋予了 `lifespan` 大限刻度，时间耗尽后将自动触发缩小化作泡泡自毁。这意味着不管挂机多久、生成多少轮物体，底层画布承载的最高同时存在实体数依然得到了可控闭环收敛！不仅维持了优雅，更保障了安卓或大屏上的流畅稳帧。

### 3. 数据校验空缺缺失 (Validation Missing)
目前后端的 `generate_3d_object` 虽然声明接受 `input: String` 参数，但实际上由于仅处理次数或随机逻辑而闲置并丢弃了用户的输入负载。待对接 AI 时，需要对此 `input` 内容进行敏感审查以及 JSON 反序列化的强类型判断操作。
