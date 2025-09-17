import * as THREE from 'three';
import { Block } from '../types';

// Système de raycasting optimisé pour les chunks
export class OptimizedRaycaster {
  private raycaster: THREE.Raycaster;

  constructor() {
    this.raycaster = new THREE.Raycaster();
  }

  // Raycast uniquement sur les blocs proches du joueur pour de meilleures performances
  raycastBlocks(
    camera: THREE.Camera, 
    blocks: Map<string, Block>, 
    playerPosition: THREE.Vector3,
    maxDistance: number = 10
  ): { blockPos: THREE.Vector3; normal: THREE.Vector3; distance: number } | null {
    
    // Centre de l'écran
    const mouse = new THREE.Vector2(0, 0);
    this.raycaster.setFromCamera(mouse, camera);

    // Collecter seulement les blocs proches pour optimiser les performances
    const nearbyBlocks: { pos: THREE.Vector3; block: Block }[] = [];
    const searchRadius = maxDistance + 5; // Un peu plus large que la distance max
    
    blocks.forEach((block) => {
      const distance = playerPosition.distanceTo(new THREE.Vector3(block.x, block.y, block.z));
      if (distance <= searchRadius) {
        nearbyBlocks.push({
          pos: new THREE.Vector3(block.x, block.y, block.z),
          block: block
        });
      }
    });

    // Si pas de blocs proches, retourner null
    if (nearbyBlocks.length === 0) {
      return null;
    }

    // Raycast sur les blocs proches uniquement
    const intersections: { distance: number; point: THREE.Vector3; blockPos: THREE.Vector3; normal: THREE.Vector3 }[] = [];
    
    for (const { pos } of nearbyBlocks) {
      const blockBox = new THREE.Box3(
        new THREE.Vector3(pos.x - 0.5, pos.y - 0.5, pos.z - 0.5),
        new THREE.Vector3(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5)
      );

      const intersectPoint = new THREE.Vector3();
      if (this.raycaster.ray.intersectBox(blockBox, intersectPoint)) {
        const distance = camera.position.distanceTo(intersectPoint);
        
        // Ignorer les blocs trop loin
        if (distance > maxDistance) continue;
        
        // Calculer la normale
        const center = new THREE.Vector3(pos.x, pos.y, pos.z);
        const localPoint = intersectPoint.clone().sub(center);
        
        const absX = Math.abs(localPoint.x);
        const absY = Math.abs(localPoint.y);
        const absZ = Math.abs(localPoint.z);
        
        let normal = new THREE.Vector3();
        if (absX > absY && absX > absZ) {
          normal.set(Math.sign(localPoint.x), 0, 0);
        } else if (absY > absZ) {
          normal.set(0, Math.sign(localPoint.y), 0);
        } else {
          normal.set(0, 0, Math.sign(localPoint.z));
        }

        intersections.push({
          distance: distance,
          point: intersectPoint,
          blockPos: pos.clone(),
          normal: normal
        });
      }
    }

    if (intersections.length === 0) {
      return null;
    }

    // Retourner l'intersection la plus proche
    intersections.sort((a, b) => a.distance - b.distance);
    const closest = intersections[0];
    
    return {
      blockPos: closest.blockPos,
      normal: closest.normal,
      distance: closest.distance
    };
  }
}

export default OptimizedRaycaster;