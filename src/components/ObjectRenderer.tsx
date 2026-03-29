import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface SceneObject {
  id: string;
  geometryType: string;
  color: string;
  position: [number, number, number];
  scale: [number, number, number];
  points?: [number, number][]; // 大模型下发的坐标序列
  lifespan: number; // 生命周期，毫秒
}

export function ObjectRenderer({ object, onExpire }: { object: SceneObject, onExpire: (id: string) => void }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const [isDying, setIsDying] = useState(false);
  const targetScale = new THREE.Vector3(...object.scale);
  const zeroScale = new THREE.Vector3(0, 0, 0);

  // 【缓存计算】将 JSON 数组转为 Three.js 能理解的纯量 Vector2 (生成 Lathe 使用)
  const lathePoints = useMemo(() => {
    if (object.geometryType === 'lathe' && object.points) {
      return object.points.map(p => new THREE.Vector2(p[0], p[1]));
    }
    return [];
  }, [object.geometryType, object.points]);

  // 【缓存计算】通过 moveTo 和 lineTo 绘制带有头尾闭合的 2D Profile 形状 (生成 Extrude 使用)
  const extrudeShape = useMemo(() => {
    const shape = new THREE.Shape();
    if (object.geometryType === 'extrude' && object.points && object.points.length > 0) {
      shape.moveTo(object.points[0][0], object.points[0][1]);
      for (let i = 1; i < object.points.length; i++) {
        shape.lineTo(object.points[i][0], object.points[i][1]);
      }
      // 强制线条闭合形成截面
      shape.lineTo(object.points[0][0], object.points[0][1]);
    }
    return shape;
  }, [object.geometryType, object.points]);

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

  useFrame((_state, delta) => {
    if (meshRef.current) {
      if (isDying) {
        meshRef.current.scale.lerp(zeroScale, 8 * delta);
      } else {
        meshRef.current.scale.lerp(targetScale, 6 * delta);
      }

      // 所有物体都给一点底层的自传动态效果，赋予赛博生命感
      meshRef.current.rotation.y += delta * 0.5;
      if (object.geometryType === 'extrude' || object.geometryType === 'torus') {
        meshRef.current.rotation.x += delta * 0.2;
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
      {/* -------- Fallback 兼容模式原生图形 -------- */}
      {object.geometryType === 'box' && <boxGeometry args={[1, 1, 1]} />}
      {object.geometryType === 'sphere' && <sphereGeometry args={[0.6, 64, 64]} />}
      {object.geometryType === 'torus' && <torusGeometry args={[0.5, 0.2, 32, 100]} />}
      
      {/* -------- 极其硬核的极客大模型端到端向量图形 -------- */}
      {object.geometryType === 'lathe' && lathePoints.length > 0 && (
         <latheGeometry args={[lathePoints, 32]} />
      )}
      {object.geometryType === 'extrude' && object.points && object.points.length > 0 && (
         <extrudeGeometry args={[extrudeShape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1 }]} />
      )}

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
