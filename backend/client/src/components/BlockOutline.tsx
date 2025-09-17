import React from 'react';
import * as THREE from 'three';


interface BlockOutlineProps {
  position: [number, number, number];
  color?: string;
}

const OUTLINE_VERTICES = [
  // Bottom face
  [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5],
  [0.5, -0.5, -0.5], [0.5, -0.5, 0.5],
  [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5],
  [-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5],
  // Top face
  [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5],
  [0.5, 0.5, -0.5], [0.5, 0.5, 0.5],
  [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
  [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5],
  // Vertical edges
  [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5],
  [0.5, -0.5, -0.5], [0.5, 0.5, -0.5],
  [0.5, -0.5, 0.5], [0.5, 0.5, 0.5],
  [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5],
];

const BlockOutline: React.FC<BlockOutlineProps> = ({ position, color = '#ffffff' }) => {
  const points = OUTLINE_VERTICES.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  return (
    <lineSegments position={position as any}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={new Float32Array(points.flatMap((v) => [v.x, v.y, v.z]))}
          count={points.length}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color={color} linewidth={2} />
    </lineSegments>
  );
};

export default BlockOutline;
