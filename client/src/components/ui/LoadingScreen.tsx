import React from 'react';
import Spinner from './Spinner';

export interface LoadingScreenProps {
  message?: string;
  progress?: number;
  showProgress?: boolean;
  overlay?: boolean;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Loading...',
  progress,
  showProgress = false,
  overlay = false,
}) => {
  const containerStyles: React.CSSProperties = {
    position: overlay ? 'fixed' : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: overlay ? 'rgba(0, 0, 0, 0.9)' : '#0a0a0a',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: overlay ? 9999 : 1000,
    gap: '24px',
  };

  const contentStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '32px',
    backgroundColor: '#111',
    borderRadius: '12px',
    border: '1px solid #333',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
  };

  const messageStyles: React.CSSProperties = {
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: '500',
    textAlign: 'center',
    margin: 0,
  };

  const progressBarStyles: React.CSSProperties = {
    width: '200px',
    height: '4px',
    backgroundColor: '#333',
    borderRadius: '2px',
    overflow: 'hidden',
    marginTop: '8px',
  };

  const progressFillStyles: React.CSSProperties = {
    height: '100%',
    backgroundColor: '#555',
    borderRadius: '2px',
    transition: 'width 0.3s ease-in-out',
    width: `${Math.min(Math.max(progress || 0, 0), 100)}%`,
  };

  const progressTextStyles: React.CSSProperties = {
    color: '#999',
    fontSize: '14px',
    marginTop: '4px',
  };

  return (
    <div style={containerStyles}>
      <div style={contentStyles}>
        <Spinner size="large" color="#ffffff" />
        <p style={messageStyles}>{message}</p>
        
        {showProgress && typeof progress === 'number' && (
          <>
            <div style={progressBarStyles}>
              <div style={progressFillStyles} />
            </div>
            <div style={progressTextStyles}>
              {Math.round(progress)}%
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LoadingScreen;
