import React from 'react';

export interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: 'text' | 'password' | 'email' | 'url';
  label?: string;
  error?: string;
  fullWidth?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const Input: React.FC<InputProps> = ({
  value,
  onChange,
  placeholder = '',
  disabled = false,
  type = 'text',
  label,
  error,
  fullWidth = false,
  className = '',
  style = {},
}) => {
  const baseStyles: React.CSSProperties = {
    backgroundColor: '#0d0d0d',
    border: `1px solid ${error ? '#666' : '#333'}`,
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '15px',
    padding: '12px 16px',
    outline: 'none',
    transition: 'all 0.2s ease-in-out',
    width: fullWidth ? '100%' : 'auto',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    ...style,
  };

  const labelStyles: React.CSSProperties = {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#ffffff',
  };

  const errorStyles: React.CSSProperties = {
    marginTop: '4px',
    fontSize: '12px',
    color: '#999',
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className={className} style={{ width: fullWidth ? '100%' : 'auto' }}>
      {label && <label style={labelStyles}>{label}</label>}
      <input
        type={type}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          ...baseStyles,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'text',
        }}
        onFocus={(e) => {
          if (!disabled) {
            e.target.style.borderColor = error ? '#666' : '#555';
            e.target.style.backgroundColor = '#111';
          }
        }}
        onBlur={(e) => {
          e.target.style.borderColor = error ? '#666' : '#333';
          e.target.style.backgroundColor = '#0d0d0d';
        }}
      />
      {error && <div style={errorStyles}>{error}</div>}
    </div>
  );
};

export default Input;
