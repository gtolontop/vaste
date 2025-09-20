import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button, Input } from "../components/ui";

const RegisterPage: React.FC = () => {
  const { state, register } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (state.isAuthenticated) {
      navigate("/");
    }
  }, [state.isAuthenticated, navigate]);

  const containerStyles: React.CSSProperties = {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "1rem 2rem",
    width: "100%",
    minHeight: "calc(100vh - 160px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  };

  const formContainerStyle: React.CSSProperties = {
    maxWidth: "500px",
    width: "100%",
  };

  const titleStyles: React.CSSProperties = {
    color: "#ffffff",
    fontSize: "2rem",
    fontWeight: "bold",
    marginBottom: "0.5rem",
    textAlign: "center",
  };

  const subtitleStyles: React.CSSProperties = {
    fontSize: "1rem",
    color: "#ccc",
    textAlign: "center",
    marginBottom: "2rem",
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

  const errorStyles: React.CSSProperties = {
    background: "rgba(239, 68, 68, 0.1)",
    color: "rgba(239, 68, 68, 0.9)",
    padding: "1rem",
    borderRadius: "8px",
    border: "1px solid rgba(239, 68, 68, 0.2)",
    marginBottom: "1rem",
  };

  const linkStyles: React.CSSProperties = {
    textAlign: "center",
    marginTop: "1.5rem",
    color: "#ccc",
  };

  const linkButtonStyles: React.CSSProperties = {
    color: "#61dafb",
    textDecoration: "none",
    fontWeight: "500",
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setAuthError(""); // Clear error when user types
  };

  const validateForm = () => {
    if (!formData.username.trim()) {
      setAuthError("Username is required");
      return false;
    }
    if (!formData.email.trim()) {
      setAuthError("Email is required");
      return false;
    }
    if (!formData.password) {
      setAuthError("Password is required");
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setAuthError("Passwords do not match");
      return false;
    }
    if (formData.password.length < 6) {
      setAuthError("Password must be at least 6 characters long");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setAuthLoading(true);
    setAuthError("");

    try {
      await register(formData.username.trim(), formData.email.trim(), formData.password);
      navigate("/");
    } catch (error: any) {
      setAuthError(error.message || "Registration failed");
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div style={containerStyles}>
      <div style={formContainerStyle}>
        <h1 style={titleStyles}>Create Account</h1>
        <p style={subtitleStyles}>Join Vaste to create and manage your game servers</p>

        {authError && <div style={errorStyles}>{authError}</div>}

        <form onSubmit={handleSubmit} style={formStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Username</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => handleInputChange("username", e.target.value)}
              style={inputStyle}
              placeholder="Enter your username"
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
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              style={inputStyle}
              placeholder="Enter your email"
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
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => handleInputChange("password", e.target.value)}
              style={inputStyle}
              placeholder="Enter your password"
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
            <label style={labelStyle}>Confirm Password</label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
              style={inputStyle}
              placeholder="Confirm your password"
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

          <Button
            variant="primary"
            onClick={() => {
              const form = document.querySelector("form");
              if (form) form.requestSubmit();
            }}
            disabled={authLoading}
            style={{ width: "100%", marginTop: "1rem" }}
          >
            {authLoading ? "Creating Account..." : "Create Account"}
          </Button>
        </form>

        <div style={linkStyles}>
          Already have an account?{" "}
          <Link to="/login" style={linkButtonStyles}>
            Sign in here
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
