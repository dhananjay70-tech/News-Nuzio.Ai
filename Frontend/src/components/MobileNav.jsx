import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { Compass, Play, Pause, Settings } from 'lucide-react';

// Fixed bottom tab bar, mobile widths only (see .mobile-nav in index.css) -
// a real responsive layout pattern, not a fake phone frame. Desktop keeps
// using the Navbar's inline links.
const MobileNav = () => {
  const { isAuthenticated } = useAuth();
  const { currentStory, isPlaying, pauseStory, resumeStory } = usePlayer();

  if (!isAuthenticated) return null;

  return (
    <nav className="mobile-nav">
      <NavLink to="/discover" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}>
        <Compass size={20} />
      </NavLink>

      <button
        onClick={() => {
          if (!currentStory) return;
          if (isPlaying) pauseStory();
          else resumeStory();
        }}
        disabled={!currentStory}
        className="mobile-nav-play"
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause size={22} fill="#FFFFFF" /> : <Play size={22} fill="#FFFFFF" style={{ marginLeft: '2px' }} />}
      </button>

      <NavLink to="/settings" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}>
        <Settings size={20} />
      </NavLink>
    </nav>
  );
};

export default MobileNav;
