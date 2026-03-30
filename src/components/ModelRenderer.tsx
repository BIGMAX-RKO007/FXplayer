import { useRef, useEffect, useMemo, useState } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Group, Vector3, Quaternion, Matrix4 } from 'three';
import { AssetSceneObject } from '../types/scene';
import { useLogger } from '../utils/logger';

// ── 提前预加载，避免第一次点击时卡顿 ──
useGLTF.preload('/assets/models/grass.glb');
useGLTF.preload('/assets/models/player.glb');

interface ModelRendererProps {
  object: AssetSceneObject;
  /** 动画切换时从外部注入新的 animation 名（非受控时由内部维护） */
  onReady?: (id: string, availableAnims: string[]) => void;
}

const CONSTANT_SPEED = 2.0; // 恒定移动速度 2 m/s（彻底阻绝滑步现象）

export function ModelRenderer({ object, onReady }: ModelRendererProps) {
  const groupRef = useRef<Group>(null!);
  const { scene, animations } = useGLTF(object.assetPath);
  const { actions, names } = useAnimations(animations, groupRef);

  // ── scene.clone(true) 确保多个同类实例互不干扰 ──
  const clonedScene = useMemo(() => scene.clone(true), [scene]);
  const { addLog } = useLogger();

  // 【核心】状态机：内部生命周期接管的动画状态（覆盖外部的 currentAnimation）
  const [internalAnim, setInternalAnim] = useState<string | null>(null);

  useEffect(() => {
    addLog('info', 'UI/MODEL', `📦 ModelRenderer 挂载: id=${object.id.slice(0, 8)}… asset=${object.assetName} anims=[${names.join(', ')}]`);
    if (onReady) onReady(object.id, names);

    if (object.hasAnimations && names.length > 0) {
      setInternalAnim(object.currentAnimation ?? 'idle');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 1. 拦截外部 props 中 currentAnimation 的变更 ──
  // 外部下发 playAnimation 时响应，但如果正在 run 阶段则不干扰
  useEffect(() => {
    if (object.currentAnimation && internalAnim !== 'run') {
      setInternalAnim(object.currentAnimation);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object.currentAnimation]);

  // ── 2. 执行真正的动画混合与淡入淡出 (CrossFade) ──
  useEffect(() => {
    if (!internalAnim || !object.hasAnimations) return;
    const newAction = actions[internalAnim];
    if (!newAction) {
      addLog('warn', 'UI/ANIM', `⚠ 动画不存在: "${internalAnim}" (可用: ${names.join(', ')})`);
      return;
    }
    // 淡出其他所有动画，并淡入新动画
    Object.entries(actions).forEach(([name, action]) => {
      if (name !== internalAnim) action?.fadeOut(0.3);
    });
    newAction.reset().fadeIn(0.3).play();
    addLog('info', 'UI/ANIM', `🔄 内部动画切换: → "${internalAnim}" (asset=${object.assetName})`);
  }, [internalAnim, actions, names, object.hasAnimations, object.assetName, addLog]);

  // ── 3. 平移步进处理器 (Speed-based duration) 与自动转向 (Slerp) ──
  useFrame((_state, delta) => {
    if (!groupRef.current || !object.targetPosition) return;

    const currentPos = groupRef.current.position;
    const targetPos = new Vector3(...object.targetPosition);
    
    // 我们在这个版本中限制人物仅在平面上跑动（高度固定为初始高度）
    targetPos.y = currentPos.y; 

    // 计算到目标的距离
    const distance = currentPos.distanceTo(targetPos);

    if (distance > 0.1) {
      // 开启“跑步”动画
      if (internalAnim !== 'run' && actions['run']) {
        setInternalAnim('run');
      }

      // [位移]：基于时间计算每帧的步长（恒定速度）
      const step = CONSTANT_SPEED * delta;
      // 确保如果是最后一步，alpha 会等于 1，不会超出目标点
      const alpha = Math.min(step / distance, 1.0);
      currentPos.lerp(targetPos, alpha);

      // [朝向]：自动计算小人朝向 (Smooth LookAt Slerp)
      // 注意方向是 target 减去 current
      const direction = new Vector3().subVectors(targetPos, currentPos).normalize();
      if (direction.lengthSq() > 0.0001) {
        // 创建一个看向目标方向的旋转矩阵，再转换为四元数
        const lookMatrix = new Matrix4().lookAt(currentPos, targetPos, new Vector3(0, 1, 0));
        const targetQuat = new Quaternion().setFromRotationMatrix(lookMatrix);
        
        // 以更快的速度修正朝向（角速度），让边跑边转变得流畅
        groupRef.current.quaternion.slerp(targetQuat, 10 * delta);
      }
    } else {
      // 判定到达！吸附到目标坐标，并回退到空闲动画
      currentPos.copy(targetPos);
      if (internalAnim === 'run' && actions['idle']) {
        setInternalAnim('idle');
        addLog('debug', 'UI/MODEL', `📍 目的地已到达 (distance <= 0.1) -> [强制切回 idle 动画]`);
      }
    }
  });

  // [修复] 避免在组件每次渲染时被 object.position 重置。
  // 我们只在初始化，以及目标点为空（此时认为外部真正想重置 object）时强设 position。
  useEffect(() => {
    if (groupRef.current && !object.targetPosition) {
      groupRef.current.position.set(...object.position);
      groupRef.current.rotation.set(...object.rotation);
      groupRef.current.scale.set(...object.scale);
    }
  }, [object.position, object.rotation, object.scale, object.targetPosition]);

  return (
    <group
      ref={groupRef}
      castShadow
      receiveShadow
    >
      <primitive object={clonedScene} castShadow receiveShadow />
    </group>
  );
}
