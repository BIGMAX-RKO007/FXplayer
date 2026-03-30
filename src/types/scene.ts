// ─────────────────────────────────────────────────────────────
// 场景对象来源分类
// ─────────────────────────────────────────────────────────────
export type ObjectSource = 'ai-generated' | 'glb-asset';

// ─────────────────────────────────────────────────────────────
// AI 生成的参数化几何物体（lathe / extrude / box ...）
// ─────────────────────────────────────────────────────────────
export interface AISceneObject {
  id: string;
  source: 'ai-generated';
  geometryType: string;
  color: string;
  position: [number, number, number];
  targetPosition?: [number, number, number]; // AI 分配的移动目标点
  scale: [number, number, number];
  points?: [number, number][];
  lifespan: number;
}

// ─────────────────────────────────────────────────────────────
// 从本地 .glb 文件加载的资产物体
// ─────────────────────────────────────────────────────────────
export interface AssetSceneObject {
  id: string;
  source: 'glb-asset';
  assetId: string;
  assetName: string;
  assetPath: string;
  position: [number, number, number];
  targetPosition?: [number, number, number]; // AI 分配的移动目标点
  scale: [number, number, number];
  rotation: [number, number, number];
  hasAnimations: boolean;
  currentAnimation?: string; // e.g. 'idle' | 'run' | 'jump'
}

// 统一的场景物体联合类型
export type SceneObject = AISceneObject | AssetSceneObject;

// ─────────────────────────────────────────────────────────────
// 资产库中单个资产的定义（静态注册表）
// ─────────────────────────────────────────────────────────────
export interface AssetDefinition {
  id: string;
  displayName: string;
  path: string;
  hasAnimations: boolean;
  availableAnimations: string[];
  defaultScale: [number, number, number];
  description: string;
  icon: string; // emoji 图标
}

// ─────────────────────────────────────────────────────────────
// 发送给 AI 的场景快照（精简序列化的当前场景状态）
// ─────────────────────────────────────────────────────────────
export interface SceneSnapshot {
  timestamp: number;
  objectCount: number;
  objects: Array<{
    id: string;
    source: ObjectSource;
    assetName?: string;
    geometryType?: string;
    position: [number, number, number];
    scale: [number, number, number];
    currentAnimation?: string;
  }>;
}

// ─────────────────────────────────────────────────────────────
// AI 返回的动作剧本（模块三使用，目前预留接口）
// ─────────────────────────────────────────────────────────────
export type ActionType = 'moveTo' | 'playAnimation' | 'spawn' | 'remove';

export interface ActionScript {
  targetId?: string;      // 场景中物体的 id (moveTo, playAnimation, remove 时需提供)
  action: ActionType;
  position?: [number, number, number];
  animation?: string;     // playAnimation 用的动画片段名
  assetId?: string;       // spawn 时使用的资产ID
  // AI parameter geometry properties for spawn
  geometryType?: string;
  points?: [number, number][];
  color?: string;
  scale?: [number, number, number];
  // Server injected logic
  id?: string;
  lifespan?: number;
}
