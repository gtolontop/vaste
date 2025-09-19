import React, { useRef, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import { NetworkManager } from "./network";
import { GameState, getBlockKey } from "./types";
import { TextureManager } from "./TextureManager";
import { logger } from "./utils/logger";
import { MOVE_CONFIG } from "./config/movement";
import { LoadingScreen, PauseMenu } from "./components/ui";
import { GameHUD } from "./components/screens";
import { OptimizedWorld } from "./components/OptimizedWorld";
import BlockOutline from "./components/BlockOutline";
import { OptimizedRaycaster } from "./utils/OptimizedRaycaster";

// Block component
const Block: React.FC<{ position: [number, number, number]; blockType?: number }> = ({ position, blockType = 1 }) => {
  const textureManager = TextureManager.getInstance();
  const material = textureManager.createBlockMaterial(blockType);

  return (
    <mesh position={position} material={material as any}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
};

// Player component (other players)
const Player: React.FC<{ position: [number, number, number]; id: string; isCurrentPlayer?: boolean }> = ({ position, id, isCurrentPlayer = false }) => {
  if (isCurrentPlayer) return null; // Don't render current player (first person view)

  return (
    <mesh position={[position[0], position[1] + 0.9, position[2]]}>
      <boxGeometry args={[0.6, 1.8, 0.6]} />
      <meshLambertMaterial color="#4A90E2" />
    </mesh>
  );
};

// World component
const World: React.FC<{ gameState: GameState; networkManager: NetworkManager; isPaused?: boolean }> = ({ gameState, networkManager, isPaused = false }) => {
  const { camera, gl } = useThree();
  const controlsRef = useRef<any>(null);
  const [playerPosition, setPlayerPosition] = useState(new THREE.Vector3(0, 10, 0));
  // Bloc visé (pour l'outline)
  const [targetedBlock, setTargetedBlock] = useState<THREE.Vector3 | null>(null);

  // Movement configuration is imported from `config/movement.ts`

  // Movement state
  const moveState = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    boost: false, // CTRL for speed boost
  });

  const velocity = useRef(new THREE.Vector3()); // units per second
  const direction = useRef(new THREE.Vector3());

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // If paused, ignore movement and shortcut suppression
      if (isPaused) return;

      // When the pointer is locked we want to suppress browser shortcuts
      // so keys like Ctrl+S / Ctrl+T / Ctrl+W / Meta+... / F1-F12 don't trigger
      // browser behavior while playing. We still allow Escape to toggle pause and
      // avoid interfering with form inputs if any (but pointer lock normally
      // indicates gameplay focus).
      const isPointerLocked = !!(controlsRef.current && controlsRef.current.isLocked);
      const activeElement = document.activeElement as HTMLElement | null;
      const isTyping = activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA" || activeElement.isContentEditable);

      if (isPointerLocked && !isTyping) {
        // Block common browser shortcuts when pointer locked
        const ctrlOrMeta = event.ctrlKey || event.metaKey;
        const key = event.key;
        // Block function keys and ctrl/meta combos (except single Escape/Tab usage)
        if (ctrlOrMeta || /^F\d{1,2}$/.test(event.code)) {
          // Prevent browser default behavior for these combos
          try {
            event.preventDefault();
          } catch (e) {
            /* ignore */
          }
        }
      }

      switch (event.code) {
        case "KeyW":
        case "ArrowUp":
          moveState.current.forward = true;
          break;
        case "KeyS":
        case "ArrowDown":
          moveState.current.backward = true;
          break;
        case "KeyA":
        case "ArrowLeft":
          moveState.current.left = true;
          break;
        case "KeyD":
        case "ArrowRight":
          moveState.current.right = true;
          break;
        case "Space":
          moveState.current.up = true;
          event.preventDefault();
          break;
        case "ShiftLeft":
        case "ShiftRight":
          // Shift acts as crouch / move down
          moveState.current.down = true;
          break;
        case "ControlLeft":
        case "ControlRight":
          // Control acts as a speed boost modifier
          moveState.current.boost = true;
          break;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isPaused) return; // Don't handle movement keys when paused
      const isPointerLocked = !!(controlsRef.current && controlsRef.current.isLocked);
      const activeElement = document.activeElement as HTMLElement | null;
      const isTyping = activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA" || activeElement.isContentEditable);
      if (isPointerLocked && !isTyping) {
        if (event.ctrlKey || event.metaKey || /^F\d{1,2}$/.test(event.code)) {
          try {
            event.preventDefault();
          } catch (e) {
            /* ignore */
          }
        }
      }
      switch (event.code) {
        case "KeyW":
        case "ArrowUp":
          moveState.current.forward = false;
          break;
        case "KeyS":
        case "ArrowDown":
          moveState.current.backward = false;
          break;
        case "KeyA":
        case "ArrowLeft":
          moveState.current.left = false;
          break;
        case "KeyD":
        case "ArrowRight":
          moveState.current.right = false;
          break;
        case "Space":
          moveState.current.up = false;
          break;
        case "ShiftLeft":
        case "ShiftRight":
          moveState.current.down = false;
          break;
        case "ControlLeft":
        case "ControlRight":
          moveState.current.boost = false;
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, [isPaused]);

  // Handle mouse clicks for block interaction & update targeted block for outline
  useEffect(() => {
    const optimizedRaycaster = new OptimizedRaycaster();

    // Helper function to check if position is within reasonable bounds
    const isReasonablePosition = (x: number, y: number, z: number) => {
      const MAX_COORD = 10000;
      const MIN_COORD = -10000;
      return x >= MIN_COORD && x <= MAX_COORD && y >= MIN_COORD && y <= MAX_COORD && z >= MIN_COORD && z <= MAX_COORD;
    };

    // Pour l'outline : update à chaque frame
    let animationFrameId: number;
    const updateTargetedBlock = () => {
      if (!controlsRef.current?.isLocked || isPaused) {
        setTargetedBlock(null);
        animationFrameId = requestAnimationFrame(updateTargetedBlock);
        return;
      }
      {
        /* Debug overlay - quick visibility of counts */
      }
      <div style={{ position: "absolute", left: 8, top: 8, zIndex: 9999, color: "#fff", background: "rgba(0,0,0,0.4)", padding: "6px 8px", borderRadius: 6, fontSize: 12 }}>
        <div>Blocks: {gameState.blocks.size}</div>
        <div>Chunks: {gameState.chunks.size}</div>
        <div>ChunkVersions: {gameState.chunkVersions.size}</div>
        <div>Connected: {gameState.connected ? "yes" : "no"}</div>
      </div>;

      const raycastResult = optimizedRaycaster.raycastBlocks(camera, gameState.blocks, playerPosition, 8);
      if (raycastResult) {
        setTargetedBlock(raycastResult.blockPos.clone());
      } else {
        setTargetedBlock(null);
      }
      animationFrameId = requestAnimationFrame(updateTargetedBlock);
    };
    updateTargetedBlock();

    // Click interaction
    const handleClick = (event: MouseEvent) => {
      if (!controlsRef.current?.isLocked || isPaused) return;
      const raycastResult = optimizedRaycaster.raycastBlocks(camera, gameState.blocks, playerPosition, 8);
      if (!raycastResult) return;
      const blockX = Math.round(raycastResult.blockPos.x);
      const blockY = Math.round(raycastResult.blockPos.y);
      const blockZ = Math.round(raycastResult.blockPos.z);
      if (event.button === 0) {
        // Left click - break block
        if (isReasonablePosition(blockX, blockY, blockZ)) {
          const actionId = (networkManager as any).sendBlockAction({
            type: "break_block",
            x: blockX,
            y: blockY,
            z: blockZ,
          });
          // Optionally we could track actionId in UI for undo/feedback
        }
      } else if (event.button === 2) {
        // Right click - place block adjacent to the hit face
        const placeX = blockX + Math.round(raycastResult.normal.x);
        const placeY = blockY + Math.round(raycastResult.normal.y);
        const placeZ = blockZ + Math.round(raycastResult.normal.z);
        if (isReasonablePosition(placeX, placeY, placeZ)) {
          const existingBlockKey = getBlockKey(placeX, placeY, placeZ);
          if (!gameState.blocks.has(existingBlockKey)) {
            const actionId = (networkManager as any).sendBlockAction({
              type: "place_block",
              x: placeX,
              y: placeY,
              z: placeZ,
              blockType: 1,
            });
          }
        }
      }
    };
    gl.domElement.addEventListener("mousedown", handleClick);
    gl.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
    return () => {
      gl.domElement.removeEventListener("mousedown", handleClick);
      cancelAnimationFrame(animationFrameId);
    };
  }, [camera, gl, gameState.blocks, networkManager, isPaused, playerPosition]);

  // Track player movement with acceleration and smooth deceleration (slide)
  useFrame((_, delta) => {
    if (controlsRef.current?.isLocked && !isPaused) {
      // Determine desired directional input
      direction.current.set(0, 0, 0);
      if (moveState.current.forward) direction.current.z -= 1;
      if (moveState.current.backward) direction.current.z += 1;
      if (moveState.current.left) direction.current.x -= 1;
      if (moveState.current.right) direction.current.x += 1;
      if (moveState.current.up) direction.current.y += 1;
      if (moveState.current.down) direction.current.y -= 1;

      // Compute current speed target (units per second)
      let speed = MOVE_CONFIG.baseSpeed;
      if (moveState.current.boost) speed *= MOVE_CONFIG.boostMultiplier;

      // Compute world-space target velocity (units per second)
      const targetVelocity = new THREE.Vector3(0, 0, 0);
      if (direction.current.lengthSq() > 0) {
        const dir = direction.current.clone().normalize();

        // Camera local directions
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        const right = new THREE.Vector3();
        right.crossVectors(cameraDirection, camera.up).normalize();
        const forward = new THREE.Vector3();
        forward.crossVectors(camera.up, right).normalize();

        // Compose horizontal movement relative to camera
        targetVelocity.addScaledVector(forward, -dir.z * speed);
        targetVelocity.addScaledVector(right, dir.x * speed);

        // Vertical movement is direct (up/down)
        targetVelocity.y = dir.y * speed;
      }

      // Move velocity toward target using max acceleration per frame
      const maxStep = MOVE_CONFIG.acceleration * delta; // units per second change allowed this frame
      const diff = targetVelocity.clone().sub(velocity.current);
      const diffLen = diff.length();
      if (diffLen <= maxStep || maxStep <= 0) {
        // we can reach target this frame
        velocity.current.copy(targetVelocity);
      } else {
        // move toward target by maxStep
        velocity.current.add(diff.normalize().multiplyScalar(maxStep));
      }

      // Apply translation: velocity is units/sec, so multiply by delta
      camera.position.add(velocity.current.clone().multiplyScalar(delta));

      // Update player position tracking
      const newPos = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z);
      setPlayerPosition(newPos);

      // Send movement update to server
      networkManager.sendMessage({
        type: "player_move",
        x: newPos.x,
        y: newPos.y,
        z: newPos.z,
      });

      // no debug callback — movement debug overlay removed
    }
  });

  // velocity is kept in `velocity.current` for internal use

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
      <OptimizedWorld chunks={(gameState as any).chunks} chunkVersions={(gameState as any).chunkVersions} playerPosition={playerPosition} />

      {/* Outline du bloc visé */}
      {targetedBlock && <BlockOutline position={[targetedBlock.x, targetedBlock.y, targetedBlock.z]} color="#ffffff" />}

      {/* Render other players */}
      {Array.from(gameState.players.values()).map((player) => (
        <Player key={player.id} id={player.id} position={[player.x, player.y, player.z]} isCurrentPlayer={player.id === gameState.playerId} />
      ))}
    </>
  );
};

// Main Game component
const Game: React.FC<{ networkManager: NetworkManager; onDisconnect: () => void }> = ({ networkManager, onDisconnect }) => {
  const [gameState, setGameState] = useState<GameState>(networkManager.getGameState());
  const [texturesLoaded, setTexturesLoaded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Handle Escape key for pause menu
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") {
        event.preventDefault();
        setIsPaused((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Preload textures
  useEffect(() => {
    const loadTextures = async () => {
      const textureManager = TextureManager.getInstance();
      const startTime = Date.now();

      try {
        await textureManager.loadBlockDefinitions();
        await textureManager.preloadTexturesFromRegistry();
        try {
          await textureManager.buildAtlas(32);
          logger.info("Texture atlas built");
        } catch (e) {
          logger.warn("Failed to build atlas, falling back to per-texture materials");
        }
        logger.info("Block definitions and textures loaded successfully");
      } catch (error) {
        logger.warn("Some textures failed to load, using fallback colors");
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
    position: "absolute",
    top: "1rem",
    right: "1rem",
    zIndex: 1000,
    padding: "0.5rem",
    background: "rgba(0, 0, 0, 0.7)",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "1.2rem",
    width: "40px",
    height: "40px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", overflow: "hidden" }}>
      {!texturesLoaded && <LoadingScreen message="Loading textures..." overlay />}

      <button style={fullscreenButtonStyle} onClick={handleFullscreen} title="Toggle Fullscreen">
        ⛶
      </button>

      <Canvas camera={{ fov: 75, near: 0.1, far: 1000 }} style={{ background: "#87CEEB", width: "100%", height: "100%" }}>
        {/* Add simple scene lighting to ensure meshes are visible */}
        <ambientLight intensity={0.9} />
        <directionalLight position={[50, 100, 20]} intensity={0.6} />
        <World gameState={gameState} networkManager={networkManager} isPaused={isPaused} />
      </Canvas>
      {/* Game HUD */}
      <GameHUD gameState={gameState} />

      {/* Pause Menu */}
      <PauseMenu isOpen={isPaused} onResume={handleResume} onDisconnect={handleDisconnect} />
    </div>
  );
};

export default Game;
