import React from 'react';

export interface SpinnerProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
  thickness?: number;
  className?: string;
  style?: React.CSSProperties;
}

const Spinner: React.FC<SpinnerProps> = ({
  size = 'medium',
  color = '#ffffff',
  thickness = 2,
  className = '',
  style = {},
}) => {
  const getSizeValue = () => {
    switch (size) {
      case 'small':
        return 16;
      case 'large':
        return 32;
      case 'medium':
      default:
        return 24;
    }
  };

  const sizeValue = getSizeValue();

  const spinnerStyles: React.CSSProperties = {
    width: `${sizeValue}px`,
    height: `${sizeValue}px`,
    border: `${thickness}px solid transparent`,
    borderTop: `${thickness}px solid ${color}`,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    ...style,
  };

  return (
    <div className={className} style={spinnerStyles} />
  );
};

export default Spinner;
