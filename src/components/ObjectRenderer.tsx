import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface SceneObject {
  id: string;
  geometryType: string;
  color: string;
  position: [number, number, number];
  scale: [number, number, number];
  lifespan: number; // 生命周期，毫秒
}

export function ObjectRenderer({ object, onExpire }: { object: SceneObject, onExpire: (id: string) => void }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const [isDying, setIsDying] = useState(false);
  const targetScale = new THREE.Vector3(...object.scale);
  const zeroScale = new THREE.Vector3(0, 0, 0);

  useEffect(() => {
    // 提前 600ms 触发缩小死亡动画
    const shrinkTime = Math.max(0, object.lifespan - 600);
    
    const shrinkTimer = setTimeout(() => {
      setIsDying(true);
    }, shrinkTime);

    // 真正从 React 状态中移除
    const removeTimer = setTimeout(() => {
      onExpire(object.id);
    }, object.lifespan);

    return () => {
      clearTimeout(shrinkTimer);
      clearTimeout(removeTimer);
    };
  }, [object.id, object.lifespan, onExpire]);

  // 使用 useFrame 产生平滑放大/缩小的动画效果
  useFrame((_state, delta) => {
    if (meshRef.current) {
      if (isDying) {
        // 死亡时缩小回 0
        meshRef.current.scale.lerp(zeroScale, 8 * delta);
      } else {
        // 出生时平滑放大至目标大小
        meshRef.current.scale.lerp(targetScale, 6 * delta);
      }

      // 无论何种形状都加一点细微的自转让它更生动
      if (object.geometryType === 'torus') {
        meshRef.current.rotation.x += delta * 0.5;
        meshRef.current.rotation.y += delta * 0.5;
      } else {
        meshRef.current.rotation.y += delta * 0.1;
      }
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={object.position}
      scale={[0, 0, 0]} // 起始缩放为0
      castShadow
      receiveShadow
    >
      {/* 根据 geometryType 动态选取几何体 */}
      {object.geometryType === 'box' && <boxGeometry args={[1, 1, 1]} />}
      {object.geometryType === 'sphere' && <sphereGeometry args={[0.6, 64, 64]} />}
      {object.geometryType === 'torus' && <torusGeometry args={[0.5, 0.2, 32, 100]} />}
      
      {/* 统一的高质感材质 */}
      <meshStandardMaterial 
        color={object.color} 
        roughness={0.15}
        metalness={0.2}
        envMapIntensity={1.5}
        transparent={true}
      />
    </mesh>
  );
}
