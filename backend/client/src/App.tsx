import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import LandingPage from "./pages/LandingPage";
import ServerListPage from "./pages/ServerListPage";
import ServerDetailPage from "./pages/ServerDetailPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import MyServersPage from "./pages/MyServersPage";
import CreateServerPage from "./pages/CreateServerPage";
import MyServerDetailPage from "./pages/MyServerDetailPage";
import GamePage from "./pages/GamePage";
import VasteFunctionsPage from "./pages/VasteFunctionsPage";

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <div
          style={{
            minHeight: "100vh",
            background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)",
            color: "#ffffff",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Navbar />
          <main style={{ flex: 1 }}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/servers" element={<ServerListPage />} />
              <Route path="/servers/:id" element={<ServerDetailPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/my-servers" element={<MyServersPage />} />
              <Route path="/create-server" element={<CreateServerPage />} />
              <Route path="/my-servers/:id" element={<MyServerDetailPage />} />
              <Route path="/play/:serverUrl" element={<GamePage />} />
              <Route path="/vaste-functions" element={<VasteFunctionsPage />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </Router>
    </AuthProvider>
  );
};

export default App;
