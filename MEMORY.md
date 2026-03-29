# FXplayer 项目记忆库 (Project Memory)

## 0. 项目概览
- **名称**：FXplayer (生成式 3D 渲染引擎)
- **目标**：构建一个由 Rust 后端驱动、React 前端渲染的实时 3D 场景生成器。最终目标是接入本地大模型 (LLM) 生成指令
- **当前阶段**：项目初始化完成 (Tauri v2 + React)，基础脚手架已跑通，

## 1. 技术栈 (Tech Stack)
技术栈约束 (Tech Stack)
外壳框架: Tauri (Rust)

前端框架: React (Vite)

3D 渲染引擎: @react-three/fiber (R3F) + @react-three/drei

通信方式: Tauri invoke (Command 模式)

## 2. 目录职责 (Directory Blueprint)
- `src/`: 前端界面开发
  - `main.tsx`: React 应用入口
  - `App.tsx`: 主界面组件 (负责录音、文件处理交互)
  - `assets/`: 静态资源 (图片、SVG等)
- `src-tauri/`: 后端 Rust 核心
  - `src/lib.rs`: Tauri v2 逻辑入口 (Command 注册、插件初始化)
  - `src/main.rs`: 二进制入口 (调用 lib 进行运行)
  - `capabilities/`: Tauri v2 权限配置 (控制窗口及插件访问权限)
  - `Cargo.toml`: Rust 依赖管理
  - `tauri.conf.json`: 项目元数据及窗口全局配置
- `dist/`: 前端静态资源构建输出 (Tauri 打包及 devServer 关联路径)

## 3. 关键进度 (Milestones)
当前阶段为单步冒烟测试，验证“指令-渲染”链路的连通性。

## 4. 开发指南 (Developer Guide)
### 常用命令
- `cargo tauri dev`: 开发模式运行 (前端热更新 + Rust 自动编译)
- `cargo tauri build`: 构建 Release 发布版本
- `cargo tauri android dev`: Android 模拟器/实机联调模式 (需配置环境)
- `cargo tauri android dev <DEVICE_NAME>`: 指定设备进行联调
- `cargo tauri android run -r`: 运行 Release 版本
- `adb version`: 查看 adb 版本
- `adb devices`: 查看连接的设备
- `adb install <path>`: 安装应用
- `adb uninstall <package>`: 卸载应用
- `adb logcat`: 查看日志
- `adb shell`: 进入 shell
- `adb pull <path>`: 从设备拉取文件
- `adb push <path>`: 推送到设备
- `adb uninstall com.fx.fxplayer`: 卸载应用

### 常用指南
官方 Android 签名文档地址：
https://v2.tauri.app/distribute/sign/android/
​Google Play 分发文档：
https://v2.tauri.app/zh-cn/distribute/google-play/
​

### 开发规范
- **Command 注册**：
- **状态管理**：
- **错误处理**：

## 5. 项目背景与决策 (Context & Decisions)
- **为何选择 Tauri v2**: 相比 v1 提供了更严谨的权限控制和对移动端 (Android/iOS) 的原生支持，有助于后续将语音识别能力带到手机端。
- **本地化优先**: 构建一个由 Rust 后端驱动、React 前端渲染的实时 3D 场景生成器。最终目标是接入本地大模型 (LLM) 生成指令，当前阶段为单步冒烟测试，验证“指令-渲染”链路的连通性。

## 6. TODO 列表 (Next Steps)


