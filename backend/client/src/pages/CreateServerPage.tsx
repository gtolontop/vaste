import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { gameServerService } from "../services/gameServerService";
import Button from "../components/ui/Button";

const CreateServerPage: React.FC = () => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [websocketUrl, setWebsocketUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !websocketUrl.trim()) {
      setError("Name and WebSocket URL are required");
      return;
    }

    // Parse WebSocket URL to extract host and port
    let host = "";
    let port = 25565;
    try {
      const url = new URL(websocketUrl.trim());
      host = url.hostname;
      port = parseInt(url.port) || 25565;
    } catch (err) {
      setError("Invalid WebSocket URL format");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await gameServerService.createServer({
        name: name.trim(),
        description: description.trim(),
        host: host,
        port: port,
        websocket_url: websocketUrl.trim(),
        max_players: 10, // Default value, will be configured in game server
        is_public: false,
      });

      // Redirect to the server detail page to show the license key
      navigate(`/my-servers/${result.server.uuid}`, {
        state: { newServer: true, licenseKey: result.server.license_key },
      });
    } catch (err: any) {
      setError(err.message || "Failed to create server");
    } finally {
      setLoading(false);
    }
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "1rem 2rem",
    width: "100%",
    minHeight: "calc(100vh - 160px)",
  };

  const titleStyle: React.CSSProperties = {
    color: "#ffffff",
    fontSize: "2rem",
    fontWeight: "bold",
    marginBottom: "2rem",
    textAlign: "center",
  };

  const formStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
  };

  const fieldStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  };

  const labelStyle: React.CSSProperties = {
    color: "#ffffff",
    fontSize: "1rem",
    fontWeight: "bold",
  };

  const inputStyle: React.CSSProperties = {
    padding: "0.75rem 1rem",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "8px",
    color: "#ffffff",
    fontSize: "1rem",
    outline: "none",
    transition: "all 0.2s ease",
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: "100px",
    resize: "vertical" as any,
    fontFamily: "inherit",
  };

  const errorStyle: React.CSSProperties = {
    background: "rgba(239, 68, 68, 0.1)",
    color: "rgba(239, 68, 68, 0.9)",
    padding: "1rem",
    borderRadius: "8px",
    border: "1px solid rgba(239, 68, 68, 0.2)",
    marginBottom: "1rem",
  };

  const actionsStyle: React.CSSProperties = {
    display: "flex",
    gap: "1rem",
    justifyContent: "flex-end",
    marginTop: "1rem",
  };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Create New Server</h1>

      {error && <div style={errorStyle}>{error}</div>}

      <form onSubmit={handleSubmit} style={formStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Server Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            placeholder="Enter server name"
            required
            onFocus={(e) => {
              e.target.style.borderColor = "rgba(255, 255, 255, 0.4)";
              e.target.style.background = "rgba(255, 255, 255, 0.08)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "rgba(255, 255, 255, 0.2)";
              e.target.style.background = "rgba(255, 255, 255, 0.05)";
            }}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={textareaStyle}
            placeholder="Enter server description (optional)"
            onFocus={(e) => {
              e.target.style.borderColor = "rgba(255, 255, 255, 0.4)";
              e.target.style.background = "rgba(255, 255, 255, 0.08)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "rgba(255, 255, 255, 0.2)";
              e.target.style.background = "rgba(255, 255, 255, 0.05)";
            }}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>WebSocket URL *</label>
          <input
            type="text"
            value={websocketUrl}
            onChange={(e) => setWebsocketUrl(e.target.value)}
            style={inputStyle}
            placeholder="ws://localhost:25565"
            required
            onFocus={(e) => {
              e.target.style.borderColor = "rgba(255, 255, 255, 0.4)";
              e.target.style.background = "rgba(255, 255, 255, 0.08)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "rgba(255, 255, 255, 0.2)";
              e.target.style.background = "rgba(255, 255, 255, 0.05)";
            }}
          />
        </div>

        <div style={actionsStyle}>
          <Button variant="secondary" onClick={() => navigate("/my-servers")} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const form = document.querySelector("form");
              if (form) form.requestSubmit();
            }}
            disabled={loading}
          >
            {loading ? "Creating..." : "Create Server"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CreateServerPage;
