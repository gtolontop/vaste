import React from 'react';
import { GameState } from '../../types';

interface GameHUDProps {
  gameState: GameState;
}

const GameHUD: React.FC<GameHUDProps> = ({ gameState }) => {
  const hudContainerStyles: React.CSSProperties = {
    position: 'absolute',
    top: '16px',
    left: '16px',
    right: '16px',
    pointerEvents: 'none',
    zIndex: 1000,
  };

  const statsCardStyles: React.CSSProperties = {
    backgroundColor: 'rgba(17, 17, 17, 0.95)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(51, 51, 51, 0.8)',
    borderRadius: '12px',
    padding: '16px',
    color: 'white',
    fontSize: '14px',
    pointerEvents: 'auto',
    maxWidth: '280px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
  };

  const crosshairStyles: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '4px',
    height: '4px',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: '50%',
    pointerEvents: 'none',
    boxShadow: '0 0 4px rgba(0, 0, 0, 0.8)',
  };

  const controlsHintStyles: React.CSSProperties = {
    position: 'absolute',
    bottom: '16px',
    left: '16px',
    backgroundColor: 'rgba(17, 17, 17, 0.95)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(51, 51, 51, 0.8)',
    borderRadius: '8px',
    padding: '12px 16px',
    color: '#999',
    fontSize: '12px',
    pointerEvents: 'auto',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
  };

  const statRowStyles: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '4px',
  };

  const statLabelStyles: React.CSSProperties = {
    color: '#999',
  };

  const statValueStyles: React.CSSProperties = {
    color: '#ffffff',
    fontWeight: '500',
  };

  return (
    <>
      <div style={hudContainerStyles}>
        {/* Stats Card */}
        <div style={statsCardStyles}>
          <div style={statRowStyles}>
            <span style={statLabelStyles}>Position:</span>
            <span style={statValueStyles}>
              {gameState.playerPosition ? 
                `${gameState.playerPosition.x.toFixed(1)}, ${gameState.playerPosition.y.toFixed(1)}, ${gameState.playerPosition.z.toFixed(1)}` 
                : 'Unknown'}
            </span>
          </div>
          <div style={statRowStyles}>
            <span style={statLabelStyles}>Players online:</span>
            <span style={statValueStyles}>{gameState.players.size + 1}</span>
          </div>
          <div style={statRowStyles}>
            <span style={statLabelStyles}>World size:</span>
            <span style={statValueStyles}>{typeof gameState.worldSize === 'number' ? gameState.worldSize : 'Dynamic'}³</span>
          </div>
          <div style={statRowStyles}>
            <span style={statLabelStyles}>Blocks:</span>
            <span style={statValueStyles}>{gameState.blocks.size}</span>
          </div>
          <div style={statRowStyles}>
            <span style={statLabelStyles}>Status:</span>
            <span style={{ 
              ...statValueStyles, 
              color: gameState.connected ? '#ccc' : '#666' 
            }}>
              {gameState.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      {/* Crosshair */}
      <div style={crosshairStyles} />

      {/* Controls Hint */}
      <div style={controlsHintStyles}>
        <div style={{ marginBottom: '4px', color: '#fff', fontSize: '13px', fontWeight: '500' }}>
          Controls:
        </div>
        <div>WASD: Move • Mouse: Look • Left Click: Break • Right Click: Place • ESC: Menu</div>
      </div>
    </>
  );
};

export default GameHUD;
