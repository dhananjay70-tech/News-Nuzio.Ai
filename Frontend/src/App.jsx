import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PreferencesProvider } from './context/PreferencesContext';
import { SettingsProvider } from './context/SettingsContext';
import { PlayerProvider } from './context/PlayerContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import Discover from './pages/Discover';
import Saved from './pages/Saved';
import Settings from './pages/Settings';
import MobileNav from './components/MobileNav';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PreferencesProvider>
        <SettingsProvider>
        <PlayerProvider>
          <div className="app-shell">
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Protected Routes */}
              <Route
                path="/onboarding"
                element={
                  <ProtectedRoute>
                    <Onboarding />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/home"
                element={
                  <ProtectedRoute>
                    <Home />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/saved"
                element={
                  <ProtectedRoute>
                    <Saved />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/discover"
                element={
                  <ProtectedRoute>
                    <Discover />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                }
              />

              {/* Fallback Routes */}
              <Route path="/" element={<Navigate to="/home" replace />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
            <MobileNav />
          </div>
        </PlayerProvider>
        </SettingsProvider>
        </PreferencesProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
