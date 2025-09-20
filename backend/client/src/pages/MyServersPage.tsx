import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import ServerManagement from "../components/ServerManagement";

const MyServersPage: React.FC = () => {
  const { state } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!state.isAuthenticated) {
      navigate("/login");
    }
  }, [state.isAuthenticated, navigate]);

  const containerStyle: React.CSSProperties = {
    minHeight: "calc(100vh - 80px)",
    padding: "2rem 0",
  };

  if (!state.isAuthenticated) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: "center", padding: "4rem", color: "#888" }}>
          <p>Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <ServerManagement />
    </div>
  );
};

export default MyServersPage;
