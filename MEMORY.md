# Project Overview

- 名称：FXplayer（Tauri + Whisper 桌面语音转文字 demo）
- 目标：先跑通一个“小而全”的本地语音转文字应用，作为 Rust + 边缘 AI 的第一站：
  - 前端：Tauri + React + TypeScript 负责录音/文件选择和结果展示
  - 后端：Rust 命令接收音频文件路径，调用 Whisper（whisper.cpp 的 Rust 封装或 whisper-rs）在本机 CPU 上做推理，返回转写文本
- 技术栈：Tauri v2 + React + TypeScript + Rust + Whisper（CPU-only, tiny 模型）

---

# Key Links & Entry Points

- 前端入口：`src/main.tsx`, `src/App.tsx`
- Tauri 配置：`src-tauri/tauri.conf.json`
- Rust 入口：`src-tauri/src/main.rs`
- Whisper 集成（计划）：`src-tauri/src/whisper.rs` 或 `src-tauri/src/ai/whisper.rs`

---

# 项目结构说明（Tauri 侧草案）

> 之后可以根据真实目录再细化和更新。

```text
FXplayer/                        # 项目根目录
├── src/                         # 前端 React + TS
│   ├── main.tsx                 # 【可编辑】React 入口，挂载 App 组件
│   └── App.tsx                  # 【可编辑】主界面：录音/选择文件按钮 + 文本展示
│
├── src-tauri/                   # Tauri + Rust 后端
│   ├── Cargo.toml               # 【可编辑】Rust 依赖（tauri, serde, whisper 封装等）
│   ├── src/
│   │   ├── main.rs              # 【可编辑】Tauri Builder，注册 #[tauri::command]
│   │   └── whisper.rs           # 【可编辑】Whisper 调用封装（模型加载 + 推理）
│   ├── tauri.conf.json          # 【可编辑】应用元数据、窗口配置、capabilities
│   └── icons/                   # 应用图标资源
│
├── package.json                 # 前端依赖 & 脚本
├── pnpm-lock.yaml               # pnpm 锁定文件
├── vite.config.ts               # Vite 配置
├── MEMORY.md                    # 【可编辑】项目记忆：结构说明、设计决策、TODO
└── ...                          # 其他自动生成/配置文件

Tauri CLI 的总帮助信息，意思是：pnpm tauri <命令> 用来初始化、开发、打包你的 Tauri 应用。
基本用法
用法：
cargo tauri [OPTIONS] <COMMAND>
pnpm run tauri [选项] <命令>
场景：在项目根目录（FXplayer）下执行，用来操作当前这个 Tauri 项目。
核心常用命令
init：在已有目录里初始化一个 Tauri 项目。
对你现在这个项目已经用不到了，是给“已有前端项目后来加 Tauri 壳”用的
dev：开发模式运行应用。
会启动前端 dev server + Tauri 窗口，支持热更新，是日常开发最常用的命令。
build：以 release 模式构建应用，并生成安装包/可执行文件。
内部会先编译，再打包。
用在你要出一个“给别人安装的版本”的时候。
bundle：只做“打包”这一步。
前提是已经 build 过（有可执行文件），它在现有构建结果基础上生成安装包/安装器。
一般直接用 build 就够，bundle 用得比较少。
android：Android 相关子命令的入口。
例如：pnpm tauri android init / dev / build。
只在你想打 Android 包或在模拟器上调试时用。
迁移 & 信息
migrate：从 Tauri v1 自动迁移到 v2 的辅助命令。
你新项目就是 v2，不用管。
info：打印环境信息。
包括：系统、Rust 版本、Node.js 版本、Tauri 相关配置等。
出问题时很适合贴给别人看。
插件相关
add：给项目添加一个 Tauri 插件。
比如以后要用官方的 plugin-window, plugin-notification 等，可以用 pnpm tauri add <插件名>。
remove：从项目中移除插件。
plugin：管理或创建 Tauri 插件。
比如你要写自己的插件，可以用这个命令生成骨架。
图标 & 签名
icon：生成各种平台需要的多尺寸图标。
给一张源图片，它会帮你生成 Windows/macOS/Linux/移动端需要的图标文件。
signer：生成签名密钥或给文件签名。
多用于 Tauri 的自动更新（updater）或发布时的签名。
权限 & 能力（v2 新概念）
permission：管理或创建权限。
Tauri v2 把敏感操作（如文件访问、HTTP 请求等）用权限文件描述。
可以用这个命令生成或修改权限文件。
capability：管理或创建能力（capability）。
能力 = 一组权限的打包，比如“文件能力”“网络能力”等。
可以根据你的应用需要定义能力，再在 tauri.conf.json 里启用。
其他工具命令
inspect：查看 Tauri 使用的一些内部配置值、解析结果等。
用于调试/检查配置。
completions：生成 shell 自动补全脚本（Bash / Zsh / PowerShell / Fish）。
方便在终端里 TAB 补全 Tauri 命令。
help：显示帮助。
pnpm tauri help 或 pnpm tauri <命令> --help 查看具体命令的用法。
选项
-v, --verbose：开启更详细的日志（可以叠加多次，-vvv 更啰嗦）。
-h, --help：显示帮助。
-V, --version：显示 Tauri CLI 版本。

