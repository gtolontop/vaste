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
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '8px',
    color: '#ffffff',
    padding: '0.5rem 1rem',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  };

  const dropdownMenuStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '0.5rem',
    background: 'rgba(20, 20, 20, 0.95)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    padding: '0.5rem 0',
    minWidth: '160px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    backdropFilter: 'blur(10px)',
  };

  const dropdownItemStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '0.75rem 1rem',
    color: '#ccc',
    textDecoration: 'none',
    fontSize: '0.9rem',
    background: 'none',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  };

  const dropdownItemHoverStyle: React.CSSProperties = {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#ffffff',
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

          <div style={dropdownContainerStyle} ref={dropdownRef}>
            <button
              style={dropdownButtonStyle}
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              {state.isAuthenticated && state.user ? state.user.username : 'Guest'}
              <span style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
                ▼
              </span>
            </button>

            {dropdownOpen && (
              <div style={dropdownMenuStyle}>
                {state.isAuthenticated && state.user ? (
                  <>
                    <Link
                      to="/my-servers"
                      style={dropdownItemStyle}
                      onClick={() => setDropdownOpen(false)}
                      onMouseEnter={(e) => Object.assign(e.currentTarget.style, dropdownItemHoverStyle)}
                      onMouseLeave={(e) => Object.assign(e.currentTarget.style, dropdownItemStyle)}
                    >
                      My Servers
                    </Link>
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
                  <Link
                    to="/login"
                    style={dropdownItemStyle}
                    onClick={() => setDropdownOpen(false)}
                    onMouseEnter={(e) => Object.assign(e.currentTarget.style, dropdownItemHoverStyle)}
                    onMouseLeave={(e) => Object.assign(e.currentTarget.style, dropdownItemStyle)}
                  >
                    Login / Register
                  </Link>
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