import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls, ContactShadows } from "@react-three/drei";
import { Sparkles, Trash2 } from "lucide-react";
import { SceneObject, ObjectRenderer } from "./components/ObjectRenderer";
import "./App.css";

// 检测是否运行在移动端（Android/iOS）
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

function App() {
  const [objects, setObjects] = useState<SceneObject[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // 触发生成 3D 对象
  async function generateObject() {
    setIsGenerating(true);
    try {
      // 传递用户的输入至大模型网关进行语义解析
      const newObject = await invoke<SceneObject>("interpret_dream", { 
        input: inputValue 
      });
      setObjects((prev) => [...prev, newObject]);
      setInputValue(""); // 清空输入框内容
    } catch (e) {
      console.error("Error generating object:", e);
    } finally {
      setIsGenerating(false);
    }
  }

  // 清除场景
  function clearScene() {
    setObjects([]);
  }

  // 依寿命自动移除物体以释放显存
  function removeObject(id: string) {
    setObjects((prev) => prev.filter((obj) => obj.id !== id));
  }

  return (
    <div className="app-container">

      {/* 底层：全屏画布层 (z-index: 0) */}
      <div className="canvas-container">
        {/* r3f Canvas 会自动挂载 resize 侦听器并自适应父容器大小 */}
        {/* mobile: 不启用 shadows，以避免 Android WebGL 阴影采样器与 HDR 纹理格式冲突 */}
        <Canvas shadows={!isMobile} camera={{ position: [0, 3, 10], fov: 45 }}>
          <color attach="background" args={['#0f1115']} />

          {/* HDR 环境光贴图；移动端 WebGL 兼容性已通过关闭 shadows 保障 */}
          <Environment preset="studio" />
          <ambientLight intensity={isMobile ? 0.6 : 0.2} />
          
          {/* 主光源；移动端降低阴影贴图分辨率以适应 GLES 驱动限制 */}
          <directionalLight
            castShadow={!isMobile}
            position={[8, 15, 8]}
            intensity={1.2}
            shadow-mapSize-width={isMobile ? 512 : 1024}
            shadow-mapSize-height={isMobile ? 512 : 1024}
            shadow-bias={-0.0001}
          />
          <directionalLight position={[-5, 5, -5]} intensity={0.5} />
          
          {/* 桌面端接触阴影；移动端跳过避免 GL_SAMPLER_2D_SHADOW_EXT 格式不兼容 */}
          {!isMobile && (
            <ContactShadows 
              position={[0, -2.5, 0]} 
              opacity={0.8} 
              scale={30} 
              blur={2.5} 
              far={10} 
              color="#000000"
            />
          )}

          {/* 渲染场景实体，传递 onExpire 回调 */}
          {objects.map((obj) => (
            <ObjectRenderer key={obj.id} object={obj} onExpire={removeObject} />
          ))}

          {/* 交互控制：开启阻尼效果让拖拽手感更佳 */}
          <OrbitControls 
            makeDefault 
            enableDamping
            dampingFactor={0.05}
            maxPolarAngle={Math.PI / 2 + 0.1} 
          />
        </Canvas>
      </div>

      {/* 顶层：悬浮 UI 界面 (z-index: 10, pointer-events: none) */}
      <div className="ui-layer">
        
        {/* 底部悬浮控制条：只包含输入框与控制 */}
        <div className="command-bar">
          
          <form 
            className="input-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (inputValue.trim()) generateObject();
            }}
          >
            <input 
              type="text" 
              className="prompt-input" 
              placeholder="Dream something..." 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isGenerating}
              autoComplete="off"
            />
            
            <button
              type="submit"
              className="generate-btn"
              disabled={isGenerating || !inputValue.trim()}
              title="Spawn Entity"
            >
              <Sparkles size={18} />
              <span className="btn-text">{isGenerating ? "..." : "Spawn"}</span>
            </button>
            
            <button 
              type="button"
              className="clear-btn" 
              onClick={clearScene}
              disabled={objects.length === 0}
              title="Clear Scene"
            >
              <Trash2 size={18} />
            </button>
          </form>
          
        </div>

      </div>

    </div>
  );
}

export default App;
