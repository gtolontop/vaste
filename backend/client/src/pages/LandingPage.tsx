import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const LandingPage: React.FC = () => {
  const { state } = useAuth();

  const containerStyle: React.CSSProperties = {
    width: "100%",
    minHeight: "100%",
    display: "flex",
    flexDirection: "column",
  };

  const heroStyle: React.CSSProperties = {
    textAlign: "center",
    padding: "3rem 2rem",
    background: "rgba(255, 255, 255, 0.02)",
    flex: "0 0 auto",
  };

  const heroContainerStyle: React.CSSProperties = {
    maxWidth: "1200px",
    margin: "0 auto",
    width: "100%",
  };

  const heroTitleStyle: React.CSSProperties = {
    fontSize: "clamp(2.5rem, 6vw, 4rem)",
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: "1rem",
    lineHeight: "1.1",
  };

  const heroSubtitleStyle: React.CSSProperties = {
    fontSize: "clamp(1rem, 2.5vw, 1.3rem)",
    color: "#ccc",
    marginBottom: "2rem",
    maxWidth: "600px",
    margin: "0 auto 2rem auto",
    lineHeight: "1.4",
  };

  const ctaButtonStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "0.75rem 1.5rem",
    background: "#ffffff",
    color: "#000",
    textDecoration: "none",
    borderRadius: "8px",
    fontSize: "1rem",
    fontWeight: "bold",
    transition: "all 0.3s ease",
    margin: "0 0.5rem",
  };

  const secondaryButtonStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "0.75rem 1.5rem",
    background: "rgba(255, 255, 255, 0.1)",
    color: "#fff",
    textDecoration: "none",
    borderRadius: "8px",
    fontSize: "1rem",
    fontWeight: "bold",
    transition: "all 0.3s ease",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    margin: "0 0.5rem",
  };

  const featuresStyle: React.CSSProperties = {
    padding: "3rem 2rem",
    flex: "1 1 auto",
  };

  const featuresContainerStyle: React.CSSProperties = {
    maxWidth: "1200px",
    margin: "0 auto",
    width: "100%",
  };

  const featuresSectionTitleStyle: React.CSSProperties = {
    fontSize: "2rem",
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: "2rem",
    color: "#ffffff",
  };

  const featuresGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "1.5rem",
    marginBottom: "2rem",
  };

  const featureCardStyle: React.CSSProperties = {
    background: "rgba(255, 255, 255, 0.03)",
    borderRadius: "8px",
    padding: "1.5rem",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    textAlign: "left",
    transition: "transform 0.3s ease",
  };

  const featureIconStyle: React.CSSProperties = {
    fontSize: "2rem",
    marginBottom: "1rem",
    color: "#fff",
  };

  const featureTitleStyle: React.CSSProperties = {
    fontSize: "1.2rem",
    fontWeight: "bold",
    marginBottom: "0.5rem",
    color: "#ffffff",
  };

  const featureDescStyle: React.CSSProperties = {
    color: "#ccc",
    lineHeight: "1.5",
    fontSize: "0.95rem",
  };

  return (
    <div style={containerStyle}>
      <div style={heroStyle}>
        <div style={heroContainerStyle}>
          <h1 style={heroTitleStyle}>Explore Infinite Worlds</h1>
          <p style={heroSubtitleStyle}>Join voxel servers, create your own worlds and live epic adventures with your friends.</p>
          <div>
            <Link to="/servers" style={ctaButtonStyle}>
              Browse Servers
            </Link>
            {!state.isAuthenticated && (
              <Link to="/login" style={secondaryButtonStyle}>
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>

      <div style={featuresStyle}>
        <div style={featuresContainerStyle}>
          <h2 style={featuresSectionTitleStyle}>Why Choose Vaste?</h2>

          <div style={featuresGridStyle}>
            <div style={featureCardStyle}>
              <div style={featureIconStyle}>🌍</div>
              <h3 style={featureTitleStyle}>Infinite Worlds</h3>
              <p style={featureDescStyle}>Discover procedurally generated worlds with unique biomes and resources to explore.</p>
            </div>

            <div style={featureCardStyle}>
              <div style={featureIconStyle}>👥</div>
              <h3 style={featureTitleStyle}>Multiplayer</h3>
              <p style={featureDescStyle}>Play with your friends on dedicated servers or create your own private server.</p>
            </div>

            <div style={featureCardStyle}>
              <div style={featureIconStyle}>⚡</div>
              <h3 style={featureTitleStyle}>Performance</h3>
              <p style={featureDescStyle}>Optimized engine for smooth performance even on vast worlds.</p>
            </div>

            <div style={featureCardStyle}>
              <div style={featureIconStyle}>🛠️</div>
              <h3 style={featureTitleStyle}>Customization</h3>
              <p style={featureDescStyle}>Configure your server with mods, custom rules and much more.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
