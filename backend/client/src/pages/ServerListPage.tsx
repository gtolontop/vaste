import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { gameServerService, GameServer } from "../services/gameServerService";

const ServerListPage: React.FC = () => {
  const [servers, setServers] = useState<GameServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [allServers, setAllServers] = useState<GameServer[]>([]);

  // Add custom CSS for scrollbar
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      .server-list-scroll::-webkit-scrollbar {
        width: 6px;
      }
      .server-list-scroll::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 3px;
      }
      .server-list-scroll::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
        transition: background 0.2s ease;
      }
      .server-list-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const loadServers = useCallback(
    async (pageNum: number = 1, reset: boolean = false) => {
      if (loading || (!hasMore && !reset)) return;

      setLoading(true);
      setError("");

      try {
        // For now, we'll load all servers and simulate pagination
        // In a real app, the backend would handle pagination
        const allServerData = await gameServerService.getPublicServers();

        if (reset) {
          setAllServers(allServerData);
        }

        // Sort servers: online first, then by player count, then by name
        const sortedServers = allServerData.sort((a, b) => {
          if (a.is_online !== b.is_online) {
            return a.is_online ? -1 : 1; // Online servers first
          }
          if (a.current_players !== b.current_players) {
            return b.current_players - a.current_players; // Higher player count first
          }
          return a.name.localeCompare(b.name); // Alphabetical by name
        });

        // Filter by search query
        const filteredServers = searchQuery ? sortedServers.filter((server) => server.name.toLowerCase().includes(searchQuery.toLowerCase()) || (server.description && server.description.toLowerCase().includes(searchQuery.toLowerCase()))) : sortedServers;

        // Simulate pagination (20 servers per page)
        const pageSize = 20;
        const startIndex = (pageNum - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const pageServers = filteredServers.slice(startIndex, endIndex);

        if (reset) {
          setServers(pageServers);
        } else {
          setServers((prev) => [...prev, ...pageServers]);
        }

        setHasMore(endIndex < filteredServers.length);
      } catch (err: any) {
        setError(err.message || "Failed to load servers");
      } finally {
        setLoading(false);
      }
    },
    [loading, hasMore, searchQuery]
  );

  useEffect(() => {
    loadServers(1, true);
  }, []);

  // Reload servers when search query changes
  useEffect(() => {
    if (allServers.length > 0) {
      setPage(1);
      loadServers(1, true);
    }
  }, [searchQuery]);

  // Auto-load more servers when scrolling near bottom
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;

      // Load more when 200px from bottom
      if (scrollHeight - scrollTop - clientHeight < 200 && hasMore && !loading) {
        setPage((prev) => {
          const nextPage = prev + 1;
          loadServers(nextPage);
          return nextPage;
        });
      }
    },
    [hasMore, loading, loadServers]
  );

  const containerStyle: React.CSSProperties = {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "1rem 2rem",
    width: "100%",
    height: "calc(100vh - 160px)", // Fixed height for navbar and footer
    display: "flex",
    flexDirection: "column",
    overflow: "hidden", // Prevent any scroll on the main container
  };

  const titleStyle: React.CSSProperties = {
    fontSize: "2rem",
    fontWeight: "bold",
    marginBottom: "1.5rem",
    color: "#ffffff",
    flex: "0 0 auto",
  };

  const searchContainerStyle: React.CSSProperties = {
    marginBottom: "1.5rem",
    flex: "0 0 auto",
    position: "relative",
    width: "100%",
  };

  const searchInputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.75rem 1rem",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "8px",
    color: "#ffffff",
    fontSize: "1rem",
    outline: "none",
    transition: "all 0.2s ease",
    boxSizing: "border-box" as const,
  };

  const serversContainerStyle: React.CSSProperties = {
    position: "relative",
    flex: "1 1 auto",
    overflow: "hidden",
    borderRadius: "8px",
    minHeight: 0, // Allow flex item to shrink below content size
  };

  const serversListStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    height: "100%",
    overflowY: "auto",
    scrollBehavior: "smooth",
    paddingRight: "4px", // Space for scrollbar
    padding: "20px 0", // Add padding for fade effects
  };

  const topFadeOverlayStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "30px",
    background: "linear-gradient(rgba(18, 18, 18, 1), transparent)",
    pointerEvents: "none",
    zIndex: 2,
  };

  const bottomFadeOverlayStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "30px",
    background: "linear-gradient(transparent, rgba(18, 18, 18, 1))",
    pointerEvents: "none",
    zIndex: 2,
  };

  const serverRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.75rem 1rem",
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "6px",
    transition: "all 0.2s ease",
    cursor: "pointer",
    minHeight: "60px",
    textDecoration: "none",
    color: "inherit",
  };

  const serverRowHoverStyle: React.CSSProperties = {
    ...serverRowStyle,
    background: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.2)",
  };

  const serverInfoStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    flex: 1,
  };

  const serverIconStyle: React.CSSProperties = {
    width: "32px",
    height: "32px",
    borderRadius: "6px",
    background: "rgba(255, 255, 255, 0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.2rem",
  };

  const serverDetailsStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
  };

  const serverNameStyle: React.CSSProperties = {
    fontSize: "1rem",
    fontWeight: "bold",
    color: "#ffffff",
    margin: 0,
  };

  const serverDescStyle: React.CSSProperties = {
    fontSize: "0.85rem",
    color: "#ccc",
    margin: 0,
  };

  const serverStatsStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    fontSize: "0.85rem",
    color: "#999",
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

  const loadMoreButtonStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.75rem",
    background: "rgba(255, 255, 255, 0.1)",
    color: "#fff",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "6px",
    fontSize: "0.9rem",
    cursor: "pointer",
    transition: "all 0.2s ease",
    marginTop: "1rem",
  };

  const errorStyle: React.CSSProperties = {
    color: "#ff6b6b",
    textAlign: "center",
    padding: "1rem",
    background: "rgba(255, 107, 107, 0.1)",
    borderRadius: "6px",
    marginBottom: "1rem",
  };

  const noServersStyle: React.CSSProperties = {
    textAlign: "center",
    color: "#999",
    padding: "2rem",
    fontSize: "1.1rem",
  };

  const loadingStyle: React.CSSProperties = {
    textAlign: "center",
    color: "#999",
    padding: "1rem",
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Available Servers</h1>

      <div style={searchContainerStyle}>
        <input
          type="text"
          placeholder="Search servers..."
          value={searchQuery}
          onChange={handleSearchChange}
          style={searchInputStyle}
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

      {error && <div style={errorStyle}>{error}</div>}

      {servers.length === 0 && !loading && !error && <div style={noServersStyle}>No servers available at the moment.</div>}

      <div style={serversContainerStyle}>
        {/* Top fade overlay */}
        <div style={topFadeOverlayStyle}></div>

        <div style={serversListStyle} className="server-list-scroll" onScroll={handleScroll}>
          {servers.map((server) => (
            <Link
              key={server.id}
              to={`/servers/${server.id}`}
              style={serverRowStyle}
              onMouseEnter={(e) => {
                Object.assign(e.currentTarget.style, serverRowHoverStyle);
              }}
              onMouseLeave={(e) => {
                Object.assign(e.currentTarget.style, serverRowStyle);
              }}
            >
              <div style={serverInfoStyle}>
                <div style={serverIconStyle}>🎮</div>
                <div style={serverDetailsStyle}>
                  <h3 style={serverNameStyle}>{server.name}</h3>
                  <p style={serverDescStyle}>{server.description || "No description available"}</p>
                </div>
              </div>

              <div style={serverStatsStyle}>
                <div style={serverStatusStyle}>
                  <div style={server.is_online ? onlineIndicatorStyle : offlineIndicatorStyle} />
                  <span>{server.is_online ? "Online" : "Offline"}</span>
                </div>
                <span>
                  {server.current_players}/{server.max_players} players
                </span>
                <span>v{server.version}</span>
              </div>
            </Link>
          ))}

          {loading && <div style={loadingStyle}>Loading servers...</div>}
        </div>

        {/* Bottom fade overlay */}
        <div style={bottomFadeOverlayStyle}></div>
      </div>
    </div>
  );
};

export default ServerListPage;
