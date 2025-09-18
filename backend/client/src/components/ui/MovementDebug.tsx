import React from 'react';

interface Props {
  velocity: { x: number; y: number; z: number };
  speed: number;
  boost: boolean;
}

export const MovementDebug: React.FC<Props> = ({ velocity, speed, boost }) => {
  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    left: '1rem',
    bottom: '1rem',
    zIndex: 1000,
    padding: '0.5rem',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: '12px',
    borderRadius: '4px'
  };

  return (
    <div style={panelStyle}>
      <div>Speed: {speed.toFixed(2)}</div>
      <div>Boost: {boost ? 'ON' : 'OFF'}</div>
      <div>Vel: x {velocity.x.toFixed(2)} y {velocity.y.toFixed(2)} z {velocity.z.toFixed(2)}</div>
    </div>
  );
};

export default MovementDebug;
