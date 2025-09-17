import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { NetworkManager } from './network';
import { GameState, getBlockKey } from './types';
import { TextureManager } from './TextureManager';
import { LoadingScreen, PauseMenu } from './components/ui';
import { GameHUD } from './components/screens';
import { OptimizedWorld } from './components/OptimizedWorld';
import { OptimizedRaycaster } from './utils/OptimizedRaycaster';

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
  if (isCurrentPlayer) return null; // Don't render current player (first person view)
  
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
  const [playerPosition, setPlayerPosition] = useState(new THREE.Vector3(0, 10, 0));
  
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
    const optimizedRaycaster = new OptimizedRaycaster();

    // Helper function to check if position is within reasonable bounds
    const isReasonablePosition = (x: number, y: number, z: number) => {
      const MAX_COORD = 10000;
      const MIN_COORD = -10000;
      return x >= MIN_COORD && x <= MAX_COORD &&
             y >= MIN_COORD && y <= MAX_COORD &&
             z >= MIN_COORD && z <= MAX_COORD;
    };

    const handleClick = (event: MouseEvent) => {
      if (!controlsRef.current?.isLocked || isPaused) return;

      // Utiliser le nouveau système de raycasting optimisé
      const raycastResult = optimizedRaycaster.raycastBlocks(camera, gameState.blocks, playerPosition, 8);
      
      if (!raycastResult) return;

      const blockX = Math.round(raycastResult.blockPos.x);
      const blockY = Math.round(raycastResult.blockPos.y);
      const blockZ = Math.round(raycastResult.blockPos.z);

      if (event.button === 0) {
        // Left click - break block
        // Check reasonable bounds before sending to server
        if (isReasonablePosition(blockX, blockY, blockZ)) {
          networkManager.sendMessage({
            type: 'break_block',
            x: blockX,
            y: blockY,
            z: blockZ
          });
        }
      } else if (event.button === 2) {
        // Right click - place block adjacent to the hit face
        const placeX = blockX + Math.round(raycastResult.normal.x);
        const placeY = blockY + Math.round(raycastResult.normal.y);
        const placeZ = blockZ + Math.round(raycastResult.normal.z);

        // Check reasonable bounds
        if (isReasonablePosition(placeX, placeY, placeZ)) {
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
    };

    gl.domElement.addEventListener('mousedown', handleClick);
    gl.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    return () => {
      gl.domElement.removeEventListener('mousedown', handleClick);
    };
  }, [camera, gl, gameState.blocks, networkManager, isPaused, playerPosition]);

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
        const newPos = new THREE.Vector3(
          camera.position.x,
          camera.position.y,
          camera.position.z
        );
        setPlayerPosition(newPos);

        // Send movement update to server
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
    setPlayerPosition(new THREE.Vector3(8, 10, 8));
  }, [camera]);

  // Setup teleport handler
  useEffect(() => {
    networkManager.onTeleport = (x: number, y: number, z: number) => {
      camera.position.set(x, y, z);
      setPlayerPosition(new THREE.Vector3(x, y, z));
    };
    
    return () => {
      networkManager.onTeleport = undefined;
    };
  }, [camera, networkManager]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} />

      {/* Controls */}
      <PointerLockControls ref={controlsRef} />

      {/* Render optimized world */}
      <OptimizedWorld 
        blocks={gameState.blocks}
        playerPosition={playerPosition}
      />

      {/* Render other players */}
      {Array.from(gameState.players.values()).map((player) => (
        <Player
          key={player.id}
          id={player.id}
          position={[player.x, player.y, player.z]}
          isCurrentPlayer={player.id === gameState.playerId}
        />
      ))}
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

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const fullscreenButtonStyle: React.CSSProperties = {
    position: 'absolute',
    top: '1rem',
    right: '1rem',
    zIndex: 1000,
    padding: '0.5rem',
    background: 'rgba(0, 0, 0, 0.7)',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1.2rem',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {!texturesLoaded && (
        <LoadingScreen message="Loading textures..." overlay />
      )}
      
      <button 
        style={fullscreenButtonStyle}
        onClick={handleFullscreen}
        title="Toggle Fullscreen"
      >
        ⛶
      </button>
      
      <Canvas
        camera={{ fov: 75, near: 0.1, far: 1000 }}
        style={{ background: '#87CEEB', width: '100%', height: '100%' }}
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
