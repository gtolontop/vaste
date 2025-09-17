import React from 'react';

const Footer: React.FC = () => {
  const footerStyle: React.CSSProperties = {
    background: 'rgba(0, 0, 0, 0.95)',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '2rem 0',
    marginTop: 'auto',
  };

  const footerContainerStyle: React.CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 2rem',
    width: '100%',
    textAlign: 'center',
  };

  const footerTextStyle: React.CSSProperties = {
    color: '#888',
    fontSize: '0.9rem',
    marginBottom: '1rem',
  };

  const linkStyle: React.CSSProperties = {
    color: '#ccc',
    textDecoration: 'none',
    fontWeight: '500',
    transition: 'color 0.2s ease',
  };

  const linkHoverStyle: React.CSSProperties = {
    color: '#ffffff',
  };

  return (
    <footer style={footerStyle}>
      <div style={footerContainerStyle}>
        <div style={footerTextStyle}>
          © 2025 Vaste. All rights reserved.
        </div>
        <div style={footerTextStyle}>
          Powered by{' '}
          <a 
            href="https://lets-pop.fr/" 
            target="_blank" 
            rel="noopener noreferrer"
            style={linkStyle}
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, linkHoverStyle)}
            onMouseLeave={(e) => Object.assign(e.currentTarget.style, linkStyle)}
          >
            Let's PoP!
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;