import React from 'react';

export interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  loading?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  disabled = false,
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  loading = false,
  className = '',
  style = {},
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: disabled || loading ? '#1a1a1a' : '#333333',
          borderColor: disabled || loading ? '#333' : '#444444',
          color: disabled || loading ? '#666' : '#ffffff',
        };
      case 'secondary':
        return {
          backgroundColor: disabled || loading ? '#1a1a1a' : 'transparent',
          borderColor: disabled || loading ? '#333' : '#444',
          color: disabled || loading ? '#666' : '#ffffff',
        };
      case 'danger':
        return {
          backgroundColor: disabled || loading ? '#1a1a1a' : '#444444',
          borderColor: disabled || loading ? '#333' : '#555555',
          color: disabled || loading ? '#666' : '#ffffff',
        };
      default:
        return {};
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          padding: '8px 12px',
          fontSize: '14px',
          minHeight: '32px',
        };
      case 'large':
        return {
          padding: '16px 24px',
          fontSize: '16px',
          minHeight: '48px',
        };
      case 'medium':
      default:
        return {
          padding: '12px 16px',
          fontSize: '15px',
          minHeight: '40px',
        };
    }
  };

  const baseStyles: React.CSSProperties = {
    border: '1px solid',
    borderRadius: '8px',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    fontWeight: '500',
    outline: 'none',
    transition: 'all 0.2s ease-in-out',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    position: 'relative',
    width: fullWidth ? '100%' : 'auto',
    boxSizing: 'border-box',
    ...getSizeStyles(),
    ...getVariantStyles(),
    ...style,
  };

  const handleClick = () => {
    if (!disabled && !loading && onClick) {
      onClick();
    }
  };

  return (
    <button
      className={className}
      style={baseStyles}
      onClick={handleClick}
      disabled={disabled || loading}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          const target = e.target as HTMLButtonElement;
          if (variant === 'primary') {
            target.style.backgroundColor = '#444444';
            target.style.borderColor = '#555555';
          } else if (variant === 'secondary') {
            target.style.backgroundColor = '#222222';
            target.style.borderColor = '#555555';
          } else if (variant === 'danger') {
            target.style.backgroundColor = '#555555';
            target.style.borderColor = '#666666';
          }
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !loading) {
          const target = e.target as HTMLButtonElement;
          const styles = getVariantStyles();
          target.style.backgroundColor = styles.backgroundColor as string;
          target.style.borderColor = styles.borderColor as string;
        }
      }}
    >
      {loading && (
        <div
          style={{
            width: '16px',
            height: '16px',
            border: '2px solid transparent',
            borderTop: '2px solid currentColor',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
      )}
      {children}
    </button>
  );
};

export default Button;
