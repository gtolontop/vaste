import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { NetworkManager } from './network';
import { GameState, getBlockKey } from './types';
import { TextureManager } from './TextureManager';
import { LoadingScreen, PauseMenu } from './components/ui';
import { GameHUD } from './components/screens';

// Block component
const Block: React.FC<{ position: [number, number, number]; blockType?: number }> = ({ 
  position, 
  blockType = 1 
}) => {
  const textureManager = TextureManager.getInstance();
  const material = textureManager.createBlockMaterial(blockType);

  return (
    <mesh position={position}>
      <boxGeometry args={[1, 1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
};

// Player component (other players)
const Player: React.FC<{ position: [number, number, number]; id: string; isCurrentPlayer?: boolean }> = ({ 
  position, 
  id, 
  isCurrentPlayer = false 
}) => {
  if (isCurrentPlayer) return null; // Don't render current player
  
  return (
    <mesh position={[position[0], position[1] + 0.9, position[2]]}>
      <boxGeometry args={[0.6, 1.8, 0.6]} />
      <meshLambertMaterial color="#4A90E2" />
    </mesh>
  );
};

// World component
const World: React.FC<{ gameState: GameState; networkManager: NetworkManager; isPaused?: boolean }> = ({ 
  gameState, 
  networkManager,
  isPaused = false
}) => {
  const { camera, gl } = useThree();
  const controlsRef = useRef<any>(null);
  
  // Movement state
  const moveState = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false
  });
  
  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isPaused) return; // Don't handle movement keys when paused
      
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          moveState.current.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          moveState.current.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          moveState.current.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          moveState.current.right = true;
          break;
        case 'Space':
          moveState.current.up = true;
          event.preventDefault();
          break;
        case 'ShiftLeft':
        case 'ControlLeft':
          moveState.current.down = true;
          break;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isPaused) return; // Don't handle movement keys when paused
      
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          moveState.current.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          moveState.current.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          moveState.current.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          moveState.current.right = false;
          break;
        case 'Space':
          moveState.current.up = false;
          break;
        case 'ShiftLeft':
        case 'ControlLeft':
          moveState.current.down = false;
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPaused]);

  // Handle mouse clicks for block interaction
  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleClick = (event: MouseEvent) => {
      if (!controlsRef.current?.isLocked || isPaused) return;

      // Calculate mouse position in normalized device coordinates
      mouse.x = 0; // Center of screen
      mouse.y = 0;

      // Update raycaster
      raycaster.setFromCamera(mouse, camera);

      // Find all block positions
      const blockPositions: { pos: THREE.Vector3; block: any }[] = [];
      gameState.blocks.forEach((block) => {
        blockPositions.push({
          pos: new THREE.Vector3(block.x, block.y, block.z),
          block: block
        });
      });

      // Cast ray and find intersections
      const intersections: { distance: number; point: THREE.Vector3; blockPos: THREE.Vector3; normal: THREE.Vector3 }[] = [];
      
      for (const { pos } of blockPositions) {
        const blockBox = new THREE.Box3(
          new THREE.Vector3(pos.x - 0.5, pos.y - 0.5, pos.z - 0.5),
          new THREE.Vector3(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5)
        );

        const intersectPoint = new THREE.Vector3();
        if (raycaster.ray.intersectBox(blockBox, intersectPoint)) {
          const distance = camera.position.distanceTo(intersectPoint);
          
          // Calculate normal by finding which face was hit
          const center = new THREE.Vector3(pos.x, pos.y, pos.z);
          const localPoint = intersectPoint.clone().sub(center);
          
          // Find the face with the largest component
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

      if (intersections.length > 0) {
        // Find closest intersection
        intersections.sort((a, b) => a.distance - b.distance);
        const closest = intersections[0];

        const blockX = Math.round(closest.blockPos.x);
        const blockY = Math.round(closest.blockPos.y);
        const blockZ = Math.round(closest.blockPos.z);

        if (event.button === 0) {
          // Left click - break block
          networkManager.sendMessage({
            type: 'break_block',
            x: blockX,
            y: blockY,
            z: blockZ
          });
        } else if (event.button === 2) {
          // Right click - place block adjacent to the hit face
          const placeX = blockX + Math.round(closest.normal.x);
          const placeY = blockY + Math.round(closest.normal.y);
          const placeZ = blockZ + Math.round(closest.normal.z);

          // Check bounds
          if (placeX >= 0 && placeX < gameState.worldSize &&
              placeY >= 0 && placeY < gameState.worldSize &&
              placeZ >= 0 && placeZ < gameState.worldSize) {
            
            // Check if position is not already occupied
            const existingBlockKey = getBlockKey(placeX, placeY, placeZ);
            if (!gameState.blocks.has(existingBlockKey)) {
              networkManager.sendMessage({
                type: 'place_block',
                x: placeX,
                y: placeY,
                z: placeZ
              });
            }
          }
        }
      }
    };

    gl.domElement.addEventListener('mousedown', handleClick);
    gl.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    return () => {
      gl.domElement.removeEventListener('mousedown', handleClick);
      gl.domElement.removeEventListener('contextmenu', (e) => e.preventDefault());
    };
  }, [camera, gl, gameState.blocks, gameState.worldSize, networkManager, isPaused]);

  // Track player movement
  useFrame((_, delta) => {
    if (controlsRef.current?.isLocked && !isPaused) {
      const moveSpeed = 5.0; // blocks per second
      const actualMoveSpeed = moveSpeed * delta;

      // Reset velocity
      velocity.current.set(0, 0, 0);

      // Calculate movement direction
      direction.current.set(0, 0, 0);

      if (moveState.current.forward) direction.current.z -= 1;
      if (moveState.current.backward) direction.current.z += 1;
      if (moveState.current.left) direction.current.x -= 1;
      if (moveState.current.right) direction.current.x += 1;
      if (moveState.current.up) direction.current.y += 1;
      if (moveState.current.down) direction.current.y -= 1;

      // Normalize and apply speed
      if (direction.current.length() > 0) {
        direction.current.normalize();
        
        // Get camera's local directions
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        
        const right = new THREE.Vector3();
        right.crossVectors(cameraDirection, camera.up).normalize();
        
        const forward = new THREE.Vector3();
        forward.crossVectors(camera.up, right).normalize();

        // Apply movement relative to camera direction
        velocity.current.addScaledVector(forward, -direction.current.z * actualMoveSpeed);
        velocity.current.addScaledVector(right, direction.current.x * actualMoveSpeed);
        velocity.current.y += direction.current.y * actualMoveSpeed;

        // Move camera
        camera.position.add(velocity.current);

        // Update player position tracking
        const newPos = {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z
        };

        // Send movement update
        networkManager.sendMessage({
          type: 'player_move',
          x: newPos.x,
          y: newPos.y,
          z: newPos.z
        });
      }
    }
  });

  // Set initial camera position
  useEffect(() => {
    camera.position.set(8, 10, 8);
  }, [camera]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} />

      {/* Controls */}
      <PointerLockControls ref={controlsRef} />

      {/* Render blocks */}
      {Array.from(gameState.blocks.values()).map((block) => (
        <Block
          key={getBlockKey(block.x, block.y, block.z)}
          position={[block.x, block.y, block.z]}
          blockType={block.type}
        />
      ))}

      {/* Render other players */}
      {Array.from(gameState.players.values()).map((player) => (
        <Player
          key={player.id}
          id={player.id}
          position={[player.x, player.y, player.z]}
          isCurrentPlayer={player.id === gameState.playerId}
        />
      ))}

      {/* Ground plane for reference */}
      <mesh position={[gameState.worldSize / 2 - 0.5, -0.5, gameState.worldSize / 2 - 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[gameState.worldSize, gameState.worldSize]} />
        <meshLambertMaterial color="#2F4F2F" transparent opacity={0.3} />
      </mesh>
    </>
  );
};

// Main Game component
const Game: React.FC<{ networkManager: NetworkManager; onDisconnect: () => void }> = ({ 
  networkManager, 
  onDisconnect 
}) => {
  const [gameState, setGameState] = useState<GameState>(networkManager.getGameState());
  const [texturesLoaded, setTexturesLoaded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Handle Escape key for pause menu
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        event.preventDefault();
        setIsPaused(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Preload textures
  useEffect(() => {
    const loadTextures = async () => {
      const textureManager = TextureManager.getInstance();
      const startTime = Date.now();
      
      try {
        await textureManager.preloadTextures();
        console.log('Textures loaded successfully');
      } catch (error) {
        console.warn('Some textures failed to load, using fallback colors');
      }
      
      // Ensure minimum loading time of 1 second
      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, 1000 - elapsedTime);
      
      setTimeout(() => {
        setTexturesLoaded(true);
      }, remainingTime);
    };

    loadTextures();
  }, []);

  useEffect(() => {
    // This is a simple way to get updates - in a real app you might use a more sophisticated state management
    const interval = setInterval(() => {
      const currentState = networkManager.getGameState();
      setGameState(currentState);
    }, 100);

    return () => clearInterval(interval);
  }, [networkManager]);

  const handleResume = () => {
    setIsPaused(false);
  };

  const handleDisconnect = () => {
    setIsPaused(false);
    onDisconnect();
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {!texturesLoaded && (
        <LoadingScreen message="Loading textures..." overlay />
      )}
      
      <Canvas
        camera={{ fov: 75, near: 0.1, far: 1000 }}
        style={{ background: '#87CEEB' }}
      >
        <World gameState={gameState} networkManager={networkManager} isPaused={isPaused} />
      </Canvas>
      
      {/* Game HUD */}
      <GameHUD gameState={gameState} />
      
      {/* Pause Menu */}
      <PauseMenu
        isOpen={isPaused}
        onResume={handleResume}
        onDisconnect={handleDisconnect}
      />
    </div>
  );
};

export default Game;
