import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, ContactShadows } from "@react-three/drei";
import { Sparkles, Trash2, Terminal, Package } from "lucide-react";
import { ObjectRenderer } from "./components/ObjectRenderer";
import { ModelRenderer } from "./components/ModelRenderer";
import { AssetLibraryPanel } from "./components/AssetLibraryPanel";
import { LogPanel } from "./components/LogPanel";
import { LogContext, LogEntry, LogLevel, createLogEntry } from "./utils/logger";
import type {
  SceneObject,
  AISceneObject,
  AssetSceneObject,
  AssetDefinition,
  SceneSnapshot,
  ActionScript,
} from "./types/scene";
import { findAsset } from "./data/assets";
import "./App.css";

// 检测是否运行在移动端
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
  navigator.userAgent
);

// Tauri 后端日志事件结构
interface BackendLogPayload {
  level: string;
  stage: string;
  message: string;
}

// ─────────────────────────────────────────────────────────────
// 防重叠网格坐标分配器
// 使用预定义格点，超出后使用带随机偏移的扩展区域
// ─────────────────────────────────────────────────────────────
const GRID_POSITIONS: [number, number, number][] = [
  [0, 0, 0], [4, 0, 0], [-4, 0, 0],
  [0, 0, 4], [0, 0, -4], [4, 0, 4],
  [-4, 0, 4], [4, 0, -4], [-4, 0, -4],
];

function getNextPosition(currentObjects: SceneObject[]): [number, number, number] {
  const count = currentObjects.length;
  if (count < GRID_POSITIONS.length) {
    return GRID_POSITIONS[count];
  }
  // 扩展区域：以 12 为半径随机散点
  return [
    -10 + Math.random() * 20,
    0,
    -10 + Math.random() * 20,
  ];
}

// ─────────────────────────────────────────────────────────────
// 场景快照：将当前 sceneObjects 序列化为 AI 可理解的精简 JSON
// ─────────────────────────────────────────────────────────────
function getSceneSnapshot(sceneObjects: SceneObject[]): SceneSnapshot {
  return {
    timestamp: Date.now(),
    objectCount: sceneObjects.length,
    objects: sceneObjects.map(obj => {
      if (obj.source === 'glb-asset') {
        const a = obj as AssetSceneObject;
        return {
          id: a.id,
          source: a.source,
          assetName: a.assetName,
          position: a.position,
          scale: a.scale,
          currentAnimation: a.currentAnimation,
        };
      } else {
        const a = obj as AISceneObject;
        return {
          id: a.id,
          source: a.source,
          geometryType: a.geometryType,
          position: a.position,
          scale: a.scale,
        };
      }
    }),
  };
}

// ─────────────────────────────────────────────────────────────
// App 主组件
// ─────────────────────────────────────────────────────────────
function App() {
  // ── 统一场景状态 ──
  const [sceneObjects, setSceneObjects] = useState<SceneObject[]>([]);

  // ── UI 状态 ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  // ── 日志系统 ──
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((level: LogLevel, stage: string, message: string) => {
    const entry = createLogEntry(level, stage, message);
    setLogs(prev => [...prev.slice(-499), entry]);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  // ── 监听 Rust 后端推送的日志事件 ──
  useEffect(() => {
    const unlisten = listen<BackendLogPayload>("dream-log", (event) => {
      const { level, stage, message } = event.payload;
      addLog(level as LogLevel, stage, message);
    });

    addLog("info", "UI/INIT", `应用初始化完成 | 平台: ${isMobile ? "移动端" : "桌面端"}`);

    return () => { unlisten.then(fn => fn()); };
  }, [addLog]);

  // ─────────────────────────────────────────────────────────────
  // 模块一：本地资产添加到场景
  // ─────────────────────────────────────────────────────────────
  function addAssetToScene(assetDef: AssetDefinition, scale: number) {
    const position = getNextPosition(sceneObjects);
    const s = scale as number;

    const newObj: AssetSceneObject = {
      id: crypto.randomUUID(),
      source: 'glb-asset',
      assetId: assetDef.id,
      assetName: assetDef.displayName,
      assetPath: assetDef.path,
      position,
      scale: [s, s, s],
      rotation: [0, 0, 0],
      hasAnimations: assetDef.hasAnimations,
      currentAnimation: assetDef.hasAnimations ? 'idle' : undefined,
    };

    addLog('info', 'UI/ASSET', `📦 添加资产: "${assetDef.displayName}" id=${newObj.id.slice(0, 8)}… position=[${position.map(v => v.toFixed(1)).join(', ')}] scale=${s}×`);
    setSceneObjects(prev => [...prev, newObj]);
  }

  // ─────────────────────────────────────────────────────────────
  // 模块三：AI 剧本请求与调度 (Execute ActionScript)
  // ─────────────────────────────────────────────────────────────
  async function generateObject() {
    addLog("info", "UI/CLICK", `▶ 导演开机 | prompt="${inputValue}"`);

    // 携带环境数据
    const snapshot = getSceneSnapshot(sceneObjects);
    const snapshotJson = JSON.stringify(snapshot);
    addLog("info", "UI/SNAPSHOT", `📸 环境感知快照: ${snapshot.objectCount} 物体`);
    // [增强追踪] 原样展示给用户的快照结构
    addLog("debug", "UI/SNAPSHOT", `[传给AI的舞台全貌数据]:\n${JSON.stringify(snapshot, null, 2)}`);

    setIsGenerating(true);
    try {
      addLog("info", "UI/INVOKE", `调用 interpret_dream()... 期待剧本返回`);

      const scripts = await invoke<ActionScript[]>("interpret_dream", {
        input: inputValue,
        sceneSnapshot: snapshotJson,
      });

      addLog("success", "UI/RESPONSE", `✅ 收到导演剧本: ${scripts.length} 条 Action`);
      // [增强追踪] 展开并直观展示 AI 返回的所有完整指令契约
      addLog("success", "UI/RESPONSE", `[AI返回的真实指令 JSON 结构]:\n${JSON.stringify(scripts, null, 2)}`);

      // ── Dispatcher：将每一步 action 同步给 sceneObjects ──
      for (const script of scripts) {
        addLog("debug", "UI/EXEC", `▶ 动作分配: [${script.action}] -> 对象ID: ${script.targetId ? script.targetId.slice(0,8) : "None"}\n  详情: ${JSON.stringify(script)}`);
      }

      setSceneObjects(prev => {
        let nextState = [...prev];

        for (const script of scripts) {
          if (script.action === 'spawn') {
            if (script.assetId) {
              const assetDef = findAsset(script.assetId);
              if (assetDef) {
                const s = script.scale?.[0] ?? 1.0;
                const newAsset: AssetSceneObject = {
                  id: script.id || crypto.randomUUID(),
                  source: 'glb-asset',
                  assetId: assetDef.id,
                  assetName: assetDef.displayName,
                  assetPath: assetDef.path,
                  position: script.position || [0, 0, 0],
                  scale: [s, s, s],
                  rotation: [0, 0, 0],
                  hasAnimations: assetDef.hasAnimations,
                  currentAnimation: assetDef.hasAnimations ? 'idle' : undefined,
                };
                nextState.push(newAsset);
              }
            } else if (script.geometryType) {
              const newAiFrame: AISceneObject = {
                id: script.id || crypto.randomUUID(),
                source: 'ai-generated',
                geometryType: script.geometryType,
                color: script.color || '#ffffff',
                position: script.position || [0, 0, 0],
                scale: script.scale || [1, 1, 1],
                points: script.points,
                lifespan: script.lifespan || 15000,
              };
              nextState.push(newAiFrame);
            }
          } 
          else if (script.action === 'moveTo' && script.targetId && script.position) {
            const idx = nextState.findIndex(o => o.id === script.targetId || o.id.includes(script.targetId!));
            if (idx >= 0) {
              nextState[idx] = { ...nextState[idx], targetPosition: script.position };
            }
          }
          else if (script.action === 'playAnimation' && script.targetId && script.animation) {
            const idx = nextState.findIndex(o => o.id === script.targetId || o.id.includes(script.targetId!));
            if (idx >= 0 && nextState[idx].source === 'glb-asset') {
              // 强制深拷贝
              nextState[idx] = { ...nextState[idx], currentAnimation: script.animation } as AssetSceneObject;
            }
          }
          else if (script.action === 'remove' && script.targetId) {
            nextState = nextState.filter(o => o.id !== script.targetId && !o.id.includes(script.targetId!));
          }
        }

        return nextState;
      });

      setInputValue("");
    } catch (e) {
      addLog("error", "UI/INVOKE", `❌ 剧本调用异常: ${String(e)}`);
      console.error("Error generating object:", e);
    } finally {
      setIsGenerating(false);
    }
  }

  // ── 清除场景 ──
  function clearScene() {
    addLog("warn", "UI/SCENE", `🗑 清空场景: 移除 ${sceneObjects.length} 个物体`);
    setSceneObjects([]);
  }

  // ── 依寿命移除 AI 生成的物体（资产物体不自动过期）──
  const removeObject = useCallback((id: string) => {
    addLog("debug", "UI/GC", `♻ 物体 ${id.slice(0, 8)}… 过期 → 从 sceneObjects 移除`);
    setSceneObjects(prev => prev.filter(obj => obj.id !== id));
  }, [addLog]);

  return (
    <LogContext.Provider value={{ logs, addLog, clearLogs }}>
      <div className="app-container">

        {/* 底层：全屏 WebGL 画布 */}
        <div className="canvas-container">
          <Canvas shadows={!isMobile} camera={{ position: [0, 5, 12], fov: 50 }}>
            <color attach="background" args={['#0f1115']} />
            <Environment preset="studio" />
            <ambientLight intensity={isMobile ? 0.6 : 0.3} />
            <directionalLight
              castShadow={!isMobile}
              position={[8, 15, 8]}
              intensity={1.2}
              shadow-mapSize-width={isMobile ? 512 : 1024}
              shadow-mapSize-height={isMobile ? 512 : 1024}
              shadow-bias={-0.0001}
            />
            <directionalLight position={[-5, 5, -5]} intensity={0.4} />

            {!isMobile && (
              <ContactShadows
                position={[0, -2.5, 0]}
                opacity={0.6}
                scale={40}
                blur={2.5}
                far={12}
                color="#000000"
              />
            )}

            {/* 渲染所有场景物体 */}
            {sceneObjects.map(obj => {
              if (obj.source === 'glb-asset') {
                return (
                  <ModelRenderer
                    key={obj.id}
                    object={obj as AssetSceneObject}
                  />
                );
              } else {
                return (
                  <ObjectRenderer
                    key={obj.id}
                    object={obj as AISceneObject}
                    onExpire={removeObject}
                  />
                );
              }
            })}

            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.05}
              maxPolarAngle={Math.PI / 2 + 0.1}
            />
          </Canvas>
        </div>

        {/* 素材库面板（绝对定位，浮于底部命令栏上方）*/}
        {showLibrary && (
          <div className="library-overlay">
            <AssetLibraryPanel
              onAddAsset={addAssetToScene}
              onClose={() => setShowLibrary(false)}
            />
          </div>
        )}

        {/* 顶层：悬浮 UI */}
        <div className="ui-layer">
          {/* 场景物体计数器 */}
          {sceneObjects.length > 0 && (
            <div className="scene-counter">
              {sceneObjects.filter(o => o.source === 'glb-asset').length} 个资产 ·{' '}
              {sceneObjects.filter(o => o.source === 'ai-generated').length} 个 AI 物体
            </div>
          )}

          <div className="command-bar">
            <form
              className="input-form"
              onSubmit={e => {
                e.preventDefault();
                if (inputValue.trim()) generateObject();
              }}
            >
              <input
                type="text"
                className="prompt-input"
                placeholder="Dream something..."
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                disabled={isGenerating}
                autoComplete="off"
              />

              <button
                type="submit"
                className="generate-btn"
                disabled={isGenerating || !inputValue.trim()}
                title="Spawn AI Entity"
              >
                <Sparkles size={18} />
                <span className="btn-text">{isGenerating ? "..." : "Spawn"}</span>
              </button>

              {/* 素材库按钮 */}
              <button
                type="button"
                className={`library-toggle-btn ${showLibrary ? 'active' : ''}`}
                onClick={() => {
                  setShowLibrary(v => !v);
                  addLog("debug", "UI/LIBRARY", `素材库面板 ${showLibrary ? '关闭' : '打开'}`);
                }}
                title="素材库"
              >
                <Package size={18} />
              </button>

              <button
                type="button"
                className="clear-btn"
                onClick={clearScene}
                disabled={sceneObjects.length === 0}
                title="Clear Scene"
              >
                <Trash2 size={18} />
              </button>

              {/* 日志控制台按钮 */}
              <button
                type="button"
                className={`log-toggle-btn ${showLog ? 'active' : ''}`}
                onClick={() => setShowLog(v => !v)}
                title="Runtime Console"
              >
                <Terminal size={18} />
                {logs.length > 0 && (
                  <span className="log-badge">
                    {logs.length > 99 ? '99+' : logs.length}
                  </span>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* 日志浮层 */}
        {showLog && <LogPanel onClose={() => setShowLog(false)} />}

      </div>
    </LogContext.Provider>
  );
}

export default App;
