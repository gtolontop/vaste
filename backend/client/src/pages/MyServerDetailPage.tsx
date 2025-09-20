import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { gameServerService, GameServer } from "../services/gameServerService";
import Button from "../components/ui/Button";

const MyServerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [server, setServer] = useState<GameServer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [licenseKeyVisible, setLicenseKeyVisible] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  // Check if this is a newly created server
  const isNewServer = location.state?.newServer;
  const newLicenseKey = location.state?.licenseKey;

  useEffect(() => {
    const loadServer = async () => {
      if (!id) return;

      try {
        const data = await gameServerService.getServer(id);
        setServer(data);
      } catch (err: any) {
        setError(err.message || "Failed to load server");
      } finally {
        setLoading(false);
      }
    };

    loadServer();
  }, [id]);

  const handleLicenseKeyClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);

    if (newCount >= 3) {
      setLicenseKeyVisible(true);
      setClickCount(0);
    }
  };

  const handleDeleteServer = async () => {
    if (!server) return;

    try {
      await gameServerService.deleteServer(server.uuid);
      navigate("/my-servers");
    } catch (err: any) {
      setError("Failed to delete server: " + err.message);
    }
  };

  const handleRenewLicense = async () => {
    if (!server) return;

    try {
      await gameServerService.renewLicense(server.uuid);
      const updatedServer = await gameServerService.getServer(server.uuid);
      setServer(updatedServer);
    } catch (err: any) {
      setError("Failed to renew license: " + err.message);
    }
  };

  const handleToggleLicense = async () => {
    if (!server) return;

    try {
      if (server.is_license_active) {
        await gameServerService.deactivateLicense(server.uuid);
      } else {
        await gameServerService.reactivateLicense(server.uuid);
      }
      const updatedServer = await gameServerService.getServer(server.uuid);
      setServer(updatedServer);
    } catch (err: any) {
      setError("Failed to toggle license: " + err.message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "1rem 2rem",
    width: "100%",
    minHeight: "calc(100vh - 160px)",
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "2rem",
  };

  const titleStyle: React.CSSProperties = {
    color: "#ffffff",
    fontSize: "2rem",
    fontWeight: "bold",
    margin: 0,
  };

  const statusBadgeStyle = (isOnline: boolean, isActive: boolean): React.CSSProperties => ({
    padding: "0.5rem 1rem",
    borderRadius: "6px",
    fontSize: "0.9rem",
    fontWeight: "bold",
    background: isActive ? (isOnline ? "rgba(34, 197, 94, 0.8)" : "rgba(239, 68, 68, 0.8)") : "rgba(107, 114, 128, 0.8)",
    color: "white",
  });

  const infoSectionStyle: React.CSSProperties = {
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    padding: "1.5rem",
    marginBottom: "1.5rem",
  };

  const sectionTitleStyle: React.CSSProperties = {
    color: "#ffffff",
    fontSize: "1.25rem",
    fontWeight: "bold",
    marginBottom: "1rem",
  };

  const infoRowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.75rem 0",
    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
  };

  const labelStyle: React.CSSProperties = {
    color: "rgba(255, 255, 255, 0.7)",
    fontWeight: "bold",
  };

  const valueStyle: React.CSSProperties = {
    color: "#ffffff",
    fontFamily: "monospace",
  };

  const licenseKeyStyle: React.CSSProperties = {
    ...valueStyle,
    filter: licenseKeyVisible ? "none" : "blur(4px)",
    cursor: licenseKeyVisible ? "pointer" : "pointer",
    userSelect: licenseKeyVisible ? "text" : "none",
    transition: "filter 0.3s ease",
  };

  const clickHintStyle: React.CSSProperties = {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: "0.8rem",
    fontStyle: "italic",
    marginTop: "0.25rem",
  };

  const actionsStyle: React.CSSProperties = {
    display: "flex",
    gap: "1rem",
    flexWrap: "wrap" as any,
    marginTop: "1.5rem",
  };

  const errorStyle: React.CSSProperties = {
    background: "rgba(239, 68, 68, 0.1)",
    color: "rgba(239, 68, 68, 0.9)",
    padding: "1rem",
    borderRadius: "8px",
    border: "1px solid rgba(239, 68, 68, 0.2)",
    marginBottom: "1rem",
  };

  const successStyle: React.CSSProperties = {
    background: "rgba(34, 197, 94, 0.1)",
    color: "rgba(34, 197, 94, 0.9)",
    padding: "1rem",
    borderRadius: "8px",
    border: "1px solid rgba(34, 197, 94, 0.2)",
    marginBottom: "1rem",
  };

  const loadingStyle: React.CSSProperties = {
    textAlign: "center" as any,
    color: "rgba(255, 255, 255, 0.7)",
    padding: "2rem",
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={loadingStyle}>Loading server details...</div>
      </div>
    );
  }

  if (!server) {
    return (
      <div style={containerStyle}>
        <div style={errorStyle}>Server not found</div>
        <Button variant="secondary" onClick={() => navigate("/my-servers")}>
          Back to My Servers
        </Button>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>{server.name}</h1>
        <span style={statusBadgeStyle(server.is_online, server.is_license_active)}>{server.is_license_active ? (server.is_online ? "Online" : "Offline") : "Inactive"}</span>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      {isNewServer && newLicenseKey && (
        <div style={successStyle}>
          <strong>Server created successfully!</strong>
          <br />
          Your license key is shown below. Save it safely - you'll need it to configure your game server.
        </div>
      )}

      <div style={infoSectionStyle}>
        <h3 style={sectionTitleStyle}>Server Information</h3>

        <div style={infoRowStyle}>
          <span style={labelStyle}>Server ID:</span>
          <span style={valueStyle}>{server.uuid}</span>
        </div>

        <div style={infoRowStyle}>
          <span style={labelStyle}>WebSocket URL:</span>
          <span style={{ ...valueStyle, cursor: "pointer" }} onClick={() => copyToClipboard(server.websocket_url)} title="Click to copy">
            {server.websocket_url}
          </span>
        </div>

        <div style={infoRowStyle}>
          <span style={labelStyle}>Host:</span>
          <span style={valueStyle}>
            {server.host}:{server.port}
          </span>
        </div>

        <div style={infoRowStyle}>
          <span style={labelStyle}>Max Players:</span>
          <span style={valueStyle}>{server.max_players}</span>
        </div>

        <div style={infoRowStyle}>
          <span style={labelStyle}>Current Players:</span>
          <span style={valueStyle}>{server.current_players}</span>
        </div>

        <div style={infoRowStyle}>
          <span style={labelStyle}>Version:</span>
          <span style={valueStyle}>{server.version}</span>
        </div>

        {server.description && (
          <div style={infoRowStyle}>
            <span style={labelStyle}>Description:</span>
            <span style={valueStyle}>{server.description}</span>
          </div>
        )}
      </div>

      <div style={infoSectionStyle}>
        <h3 style={sectionTitleStyle}>License Information</h3>

        <div style={infoRowStyle}>
          <span style={labelStyle}>License Key:</span>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={licenseKeyStyle} onClick={licenseKeyVisible ? () => copyToClipboard(server.license_key || "") : handleLicenseKeyClick} title={licenseKeyVisible ? "Click to copy" : "Click to reveal"}>
              {licenseKeyVisible ? server.license_key || "N/A" : "••••••••••••••••••••••••"}
            </span>
            {!licenseKeyVisible && (
              <span style={clickHintStyle}>
                Click {3 - clickCount} more time{3 - clickCount !== 1 ? "s" : ""} to reveal license key
              </span>
            )}
          </div>
        </div>

        <div style={infoRowStyle}>
          <span style={labelStyle}>License Status:</span>
          <span style={valueStyle}>{server.is_license_active ? "Active" : "Inactive"}</span>
        </div>

        <div style={infoRowStyle}>
          <span style={labelStyle}>License Expires:</span>
          <span style={valueStyle}>{new Date(server.license_expires_at).toLocaleDateString()}</span>
        </div>

        <div style={infoRowStyle}>
          <span style={labelStyle}>Created:</span>
          <span style={valueStyle}>{new Date(server.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      <div style={actionsStyle}>
        <Button variant="secondary" onClick={() => navigate("/my-servers")}>
          Back to My Servers
        </Button>
        <Button variant="secondary" onClick={handleRenewLicense}>
          Renew License
        </Button>
        <Button variant="secondary" onClick={handleToggleLicense}>
          {server.is_license_active ? "Deactivate" : "Activate"} License
        </Button>
        <Button variant="danger" onClick={handleDeleteServer}>
          Delete Server
        </Button>
      </div>
    </div>
  );
};

export default MyServerDetailPage;
