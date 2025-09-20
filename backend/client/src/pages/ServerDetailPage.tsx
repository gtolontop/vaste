import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { gameServerService, GameServer } from "../services/gameServerService";
import { useAuth } from "../contexts/AuthContext";

const ServerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state } = useAuth();
  const [server, setServer] = useState<GameServer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) {
      navigate("/servers");
      return;
    }

    loadServerDetails();
  }, [id, navigate]);

  const loadServerDetails = async () => {
    if (!id) return;

    setLoading(true);
    setError("");

    try {
      const servers = await gameServerService.getPublicServers();
      const foundServer = servers.find((s) => s.id === parseInt(id));

      if (!foundServer) {
        setError("Server not found");
        return;
      }

      setServer(foundServer);
    } catch (err: any) {
      setError(err.message || "Failed to load server details");
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    if (!server) return;

    if (!state.isAuthenticated) {
      navigate("/login");
      return;
    }

    // Encode the WebSocket URL for the game page
    const encodedUrl = encodeURIComponent(server.websocket_url);
    navigate(`/play/${encodedUrl}`);
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "1rem 2rem",
    width: "100%",
  };

  const backLinkStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    color: "#ccc",
    textDecoration: "none",
    marginBottom: "1.5rem",
    fontSize: "0.9rem",
    transition: "color 0.2s ease",
  };

  const titleStyle: React.CSSProperties = {
    fontSize: "2rem",
    fontWeight: "bold",
    marginBottom: "1.5rem",
    color: "#ffffff",
  };

  const serverCardStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1.5rem",
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    marginBottom: "1.5rem",
  };

  const serverInfoStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "1.5rem",
    flex: 1,
  };

  const serverIconStyle: React.CSSProperties = {
    width: "48px",
    height: "48px",
    borderRadius: "8px",
    background: "rgba(255, 255, 255, 0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.5rem",
  };

  const serverDetailsStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  };

  const serverNameStyle: React.CSSProperties = {
    fontSize: "1.5rem",
    fontWeight: "bold",
    color: "#ffffff",
    margin: 0,
  };

  const serverDescStyle: React.CSSProperties = {
    fontSize: "1rem",
    color: "#ccc",
    margin: 0,
    lineHeight: "1.4",
  };

  const serverStatsStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    fontSize: "0.9rem",
    color: "#999",
    marginTop: "0.5rem",
  };

  const serverStatusStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  };

  const onlineIndicatorStyle: React.CSSProperties = {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "#00ff00",
  };

  const offlineIndicatorStyle: React.CSSProperties = {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "#999",
  };

  const connectButtonStyle: React.CSSProperties = {
    padding: "0.75rem 1.5rem",
    background: "#ffffff",
    color: "#000",
    border: "none",
    borderRadius: "8px",
    fontSize: "1rem",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "all 0.2s ease",
  };

  const disabledButtonStyle: React.CSSProperties = {
    padding: "0.75rem 1.5rem",
    background: "#666",
    color: "#999",
    border: "none",
    borderRadius: "8px",
    fontSize: "1rem",
    fontWeight: "bold",
    cursor: "not-allowed",
  };

  const infoGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "1rem",
  };

  const infoCardStyle: React.CSSProperties = {
    padding: "1.5rem",
    background: "rgba(255, 255, 255, 0.03)",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
  };

  const cardTitleStyle: React.CSSProperties = {
    fontSize: "1.2rem",
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: "1rem",
  };

  const cardContentStyle: React.CSSProperties = {
    color: "#ccc",
    lineHeight: "1.5",
    fontSize: "0.95rem",
  };

  const infoRowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "0.5rem",
  };

  const errorStyle: React.CSSProperties = {
    color: "#ff6b6b",
    textAlign: "center",
    padding: "1.5rem",
    background: "rgba(255, 107, 107, 0.1)",
    borderRadius: "8px",
    border: "1px solid rgba(255, 107, 107, 0.2)",
  };

  const loadingStyle: React.CSSProperties = {
    textAlign: "center",
    color: "#999",
    padding: "2rem",
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={loadingStyle}>Loading server details...</div>
      </div>
    );
  }

  if (error || !server) {
    return (
      <div style={containerStyle}>
        <Link to="/servers" style={backLinkStyle}>
          ← Back to servers
        </Link>
        <div style={errorStyle}>{error || "Server not found"}</div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <Link to="/servers" style={backLinkStyle}>
        ← Back to servers
      </Link>

      <h1 style={titleStyle}>Server Details</h1>

      <div style={serverCardStyle}>
        <div style={serverInfoStyle}>
          <div style={serverIconStyle}>🎮</div>
          <div style={serverDetailsStyle}>
            <h2 style={serverNameStyle}>{server.name}</h2>
            <p style={serverDescStyle}>{server.description || "No description available"}</p>
            <div style={serverStatsStyle}>
              <div style={serverStatusStyle}>
                <div style={server.is_online ? onlineIndicatorStyle : offlineIndicatorStyle} />
                <span>{server.is_online ? "Online" : "Offline"}</span>
              </div>
              <span>
                👥 {server.current_players}/{server.max_players} players
              </span>
              <span>🏷️ v{server.version}</span>
            </div>
          </div>
        </div>
        <button style={server.is_online ? connectButtonStyle : disabledButtonStyle} disabled={!server.is_online} onClick={handleConnect}>
          {server.is_online ? "Connect" : "Offline"}
        </button>
      </div>

      <div style={infoGridStyle}>
        <div style={infoCardStyle}>
          <h3 style={cardTitleStyle}>Server Information</h3>
          <div style={cardContentStyle}>
            <div style={infoRowStyle}>
              <span>Name:</span>
              <span>{server.name}</span>
            </div>
            <div style={infoRowStyle}>
              <span>Version:</span>
              <span>{server.version}</span>
            </div>
            <div style={infoRowStyle}>
              <span>Max Players:</span>
              <span>{server.max_players}</span>
            </div>
            <div style={infoRowStyle}>
              <span>Status:</span>
              <span>{server.is_online ? "Online" : "Offline"}</span>
            </div>
            <div style={infoRowStyle}>
              <span>Current Players:</span>
              <span>{server.current_players}</span>
            </div>
          </div>
        </div>

        <div style={infoCardStyle}>
          <h3 style={cardTitleStyle}>Description</h3>
          <div style={cardContentStyle}>
            <p>{server.description || "No description provided by the server owner."}</p>
          </div>
        </div>

        <div style={infoCardStyle}>
          <h3 style={cardTitleStyle}>How to Connect</h3>
          <div style={cardContentStyle}>
            <p>1. Click the "Connect" button above if the server is online</p>
            <p>2. The game will launch automatically</p>
            <p>3. You'll be connected to this server</p>
            <p>
              <em>Make sure you're logged in to connect!</em>
            </p>
          </div>
        </div>

        <div style={infoCardStyle}>
          <h3 style={cardTitleStyle}>Server Rules</h3>
          <div style={cardContentStyle}>
            <p>• Be respectful to other players</p>
            <p>• No griefing or destroying others' builds</p>
            <p>• Follow the server moderators' instructions</p>
            <p>• Have fun and be creative!</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServerDetailPage;
