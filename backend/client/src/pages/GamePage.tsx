import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Game from "../Game";
import { NetworkManager } from "../network";
import { GameState } from "../types";
import { LoadingScreen } from "../components/ui";

const GamePage: React.FC = () => {
  const { serverUrl: encodedServerUrl } = useParams<{ serverUrl: string }>();
  const navigate = useNavigate();
  const { state: authState } = useAuth();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [networkManager, setNetworkManager] = useState<NetworkManager | null>(null);
  const [error, setError] = useState<string>("");

  const serverUrl = encodedServerUrl ? decodeURIComponent(encodedServerUrl) : "";

  useEffect(() => {
    if (!authState.isAuthenticated) {
      navigate("/login");
      return;
    }

    if (!serverUrl) {
      navigate("/servers");
      return;
    }

    // Auto-connect when the page loads
    handleConnect();
  }, [authState.isAuthenticated, serverUrl]);

  const handleConnect = async () => {
    if (connecting || !serverUrl) return;

    setConnecting(true);
    setError("");

    try {
      // visible log to confirm connect attempts in browser DevTools
      // eslint-disable-next-line no-console
      console.log("[CLIENT] GamePage: attempting connect to", serverUrl);
      const manager = new NetworkManager(
        (_gameState: GameState) => {
          // State updates are handled within the Game component
        },
        (connectionState: boolean) => {
          setConnected(connectionState);
          if (!connectionState) {
            setNetworkManager(null);
          }
        },
        authState.user || undefined
      );

      await manager.connect(serverUrl);
      setNetworkManager(manager);
    } catch (err) {
      setError("Failed to connect to server. The server might be offline or unreachable.");
      // eslint-disable-next-line no-console
      console.error("[CLIENT] Connection error:", err);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    if (networkManager) {
      networkManager.disconnect();
      setNetworkManager(null);
    }
    setConnected(false);
    navigate("/servers");
  };

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "#000",
  };

  const errorContainerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "calc(100vh - 80px)",
    padding: "2rem",
    textAlign: "center",
  };

  const errorCardStyle: React.CSSProperties = {
    background: "rgba(220, 53, 69, 0.1)",
    border: "1px solid rgba(220, 53, 69, 0.3)",
    borderRadius: "16px",
    padding: "2rem",
    maxWidth: "500px",
    width: "100%",
  };

  const errorTitleStyle: React.CSSProperties = {
    color: "#ff6b6b",
    fontSize: "1.5rem",
    fontWeight: "bold",
    marginBottom: "1rem",
  };

  const errorMessageStyle: React.CSSProperties = {
    color: "#ccc",
    marginBottom: "2rem",
    lineHeight: "1.5",
  };

  const buttonStyle: React.CSSProperties = {
    background: "rgba(97, 218, 251, 0.2)",
    border: "1px solid rgba(97, 218, 251, 0.5)",
    borderRadius: "8px",
    color: "#61dafb",
    padding: "0.75rem 1.5rem",
    cursor: "pointer",
    fontSize: "1rem",
    fontWeight: "500",
    margin: "0 0.5rem",
    textDecoration: "none",
    display: "inline-block",
  };

  // Show loading while checking authentication
  if (authState.isLoading) {
    return <LoadingScreen message="Checking authentication..." />;
  }

  // Show connecting state
  if (connecting) {
    return <LoadingScreen message={`Connecting to server...`} />;
  }

  // Show error state
  if (error) {
    return (
      <div style={containerStyle}>
        <div style={errorContainerStyle}>
          <div style={errorCardStyle}>
            <h2 style={errorTitleStyle}>Connection Failed</h2>
            <p style={errorMessageStyle}>{error}</p>
            <div>
              <button style={buttonStyle} onClick={handleConnect}>
                Try Again
              </button>
              <button style={buttonStyle} onClick={() => navigate("/servers")}>
                Back to Servers
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show game when connected
  if (connected && networkManager) {
    // Game takes full screen, no navbar/footer
    return (
      <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 9999 }}>
        <Game networkManager={networkManager} onDisconnect={handleDisconnect} />
      </div>
    );
  }

  // Default loading state
  return <LoadingScreen message="Initializing game..." />;
};

export default GamePage;
