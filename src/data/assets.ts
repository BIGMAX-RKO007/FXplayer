import { AssetDefinition } from '../types/scene';

/**
 * 本地 .glb 资产静态注册表
 * 新增资产直接在此数组追加即可，前端自动识别
 */
export const ASSET_LIBRARY: AssetDefinition[] = [
  {
    id: 'grass',
    displayName: '草地地块',
    path: '/assets/models/grass.glb',
    hasAnimations: false,
    availableAnimations: [],
    defaultScale: [1, 1, 1],
    description: '静态场景地块，可作为场地背景铺设',
    icon: '🌿',
  },
  {
    id: 'player',
    displayName: '玩家角色',
    path: '/assets/models/player.glb',
    hasAnimations: true,
    availableAnimations: ['idle', 'run', 'jump'],
    defaultScale: [1, 1, 1],
    description: '动态人物角色，支持 idle / run / jump 动画切换',
    icon: '🧍',
  },
];

/** 根据 id 快速查找资产定义 */
export function findAsset(id: string): AssetDefinition | undefined {
  return ASSET_LIBRARY.find(a => a.id === id);
}
