import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Navbar: React.FC = () => {
  const { state, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    setDropdownOpen(false);
    navigate('/');
  };

  const navStyle: React.CSSProperties = {
    background: 'rgba(0, 0, 0, 0.95)',
    backdropFilter: 'blur(10px)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    position: 'sticky',
    top: 0,
    zIndex: 1000,
  };

  const navContainerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 2rem',
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
  };

  const logoStyle: React.CSSProperties = {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#ffffff',
    textDecoration: 'none',
  };

  const navLinksStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '2rem',
  };

  const linkStyle: React.CSSProperties = {
    color: '#ccc',
    textDecoration: 'none',
    fontSize: '1rem',
    fontWeight: '500',
    transition: 'color 0.2s ease',
  };

  const linkHoverStyle: React.CSSProperties = {
    color: '#ffffff',
  };

  const dropdownContainerStyle: React.CSSProperties = {
    position: 'relative',
  };

  const dropdownButtonStyle: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '12px',
    color: '#ffffff',
    padding: '0.75rem 1rem',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    transition: 'all 0.2s ease',
    backdropFilter: 'blur(10px)',
  };

  const dropdownMenuStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '0.75rem',
    background: 'rgba(15, 15, 15, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '16px',
    padding: '0.75rem 0',
    minWidth: '200px',
    boxShadow: '0 12px 48px rgba(0, 0, 0, 0.6), 0 4px 16px rgba(0, 0, 0, 0.3)',
    backdropFilter: 'blur(20px)',
    overflow: 'hidden',
  };

  const dropdownItemStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '0.875rem 1.25rem',
    color: '#ccc',
    textDecoration: 'none',
    fontSize: '0.9rem',
    fontWeight: '500',
    background: 'none',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    position: 'relative',
  };

  const dropdownItemHoverStyle: React.CSSProperties = {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    color: '#ffffff',
    transform: 'translateX(4px)',
  };

  const dropdownSeparatorStyle: React.CSSProperties = {
    height: '1px',
    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)',
    margin: '0.5rem 1rem',
  };

  const dropdownHeaderStyle: React.CSSProperties = {
    padding: '0.5rem 1.25rem 0.75rem',
    color: '#888',
    fontSize: '0.75rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  return (
    <nav style={navStyle}>
      <div style={navContainerStyle}>
        <Link to="/" style={logoStyle}>
          Vaste
        </Link>

        <div style={navLinksStyle}>
          <Link 
            to="/servers" 
            style={linkStyle}
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, linkHoverStyle)}
            onMouseLeave={(e) => Object.assign(e.currentTarget.style, linkStyle)}
          >
            Server List
          </Link>

          <Link 
            to="/vaste-functions" 
            style={linkStyle}
            onMouseEnter={(e) => Object.assign(e.currentTarget.style, linkHoverStyle)}
            onMouseLeave={(e) => Object.assign(e.currentTarget.style, linkStyle)}
          >
            Vaste Functions
          </Link>

          <div style={dropdownContainerStyle} ref={dropdownRef}>
            <button
              style={{
                ...dropdownButtonStyle,
                backgroundColor: dropdownOpen ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.08)',
                borderColor: dropdownOpen ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.15)',
              }}
              onClick={() => setDropdownOpen(!dropdownOpen)}
              onMouseEnter={(e) => {
                if (!dropdownOpen) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                }
              }}
              onMouseLeave={(e) => {
                if (!dropdownOpen) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                }
              }}
            >
              {state.isAuthenticated && state.user ? (
                <>
                  <span style={{ 
                    width: '8px', 
                    height: '8px', 
                    backgroundColor: '#00ff88', 
                    borderRadius: '50%',
                    boxShadow: '0 0 8px rgba(0, 255, 136, 0.4)'
                  }}></span>
                  {state.user.username}
                </>
              ) : (
                <>
                  <span style={{ 
                    width: '8px', 
                    height: '8px', 
                    backgroundColor: '#888', 
                    borderRadius: '50%'
                  }}></span>
                  Guest
                </>
              )}
              <span style={{ 
                transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', 
                transition: 'transform 0.2s ease',
                fontSize: '0.7rem'
              }}>
                ▼
              </span>
            </button>

            {dropdownOpen && (
              <div style={dropdownMenuStyle}>
                {state.isAuthenticated && state.user ? (
                  <>
                    <div style={dropdownHeaderStyle}>Account</div>
                    <Link
                      to="/my-servers"
                      style={dropdownItemStyle}
                      onClick={() => setDropdownOpen(false)}
                      onMouseEnter={(e) => Object.assign(e.currentTarget.style, dropdownItemHoverStyle)}
                      onMouseLeave={(e) => Object.assign(e.currentTarget.style, dropdownItemStyle)}
                    >
                      My Servers
                    </Link>
                    <Link
                      to="/create-server"
                      style={dropdownItemStyle}
                      onClick={() => setDropdownOpen(false)}
                      onMouseEnter={(e) => Object.assign(e.currentTarget.style, dropdownItemHoverStyle)}
                      onMouseLeave={(e) => Object.assign(e.currentTarget.style, dropdownItemStyle)}
                    >
                      Create Server
                    </Link>
                    <div style={dropdownSeparatorStyle}></div>
                    <button
                      style={dropdownItemStyle}
                      onClick={handleLogout}
                      onMouseEnter={(e) => Object.assign(e.currentTarget.style, dropdownItemHoverStyle)}
                      onMouseLeave={(e) => Object.assign(e.currentTarget.style, dropdownItemStyle)}
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <div style={dropdownHeaderStyle}>Authentication</div>
                    <Link
                      to="/login"
                      style={dropdownItemStyle}
                      onClick={() => setDropdownOpen(false)}
                      onMouseEnter={(e) => Object.assign(e.currentTarget.style, dropdownItemHoverStyle)}
                      onMouseLeave={(e) => Object.assign(e.currentTarget.style, dropdownItemStyle)}
                    >
                      Login
                    </Link>
                    <Link
                      to="/register"
                      style={dropdownItemStyle}
                      onClick={() => setDropdownOpen(false)}
                      onMouseEnter={(e) => Object.assign(e.currentTarget.style, dropdownItemHoverStyle)}
                      onMouseLeave={(e) => Object.assign(e.currentTarget.style, dropdownItemStyle)}
                    >
                      Register
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;