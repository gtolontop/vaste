import React from 'react';
import Button from './Button';

interface PauseMenuProps {
  isOpen: boolean;
  onResume: () => void;
  onDisconnect: () => void;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({
  isOpen,
  onResume,
  onDisconnect,
}) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(5px)',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.9) 0%, rgba(20, 20, 20, 0.9) 100%)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '40px',
        minWidth: '300px',
        textAlign: 'center',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
      }}>
        <h2 style={{
          color: 'white',
          fontSize: '24px',
          fontWeight: '600',
          marginBottom: '30px',
          letterSpacing: '0.5px',
        }}>
          Game Paused
        </h2>
        
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
        }}>
          <Button
            onClick={onResume}
            variant="primary"
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: '500',
            }}
          >
            Resume Game
          </Button>
          
          <Button
            onClick={onDisconnect}
            variant="secondary"
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: '500',
            }}
          >
            Se déconnecter
          </Button>
        </div>
        
        <p style={{
          color: 'rgba(255, 255, 255, 0.6)',
          fontSize: '14px',
          marginTop: '20px',
          marginBottom: 0,
        }}>
          Press Esc to resume
        </p>
      </div>
    </div>
  );
};
