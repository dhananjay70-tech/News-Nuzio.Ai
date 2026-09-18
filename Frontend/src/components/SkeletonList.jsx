import React from 'react';

// Shared skeleton-loading placeholder for any list of story-card-shaped
// content (Home briefing, Discover sections, Saved list).
const SkeletonList = ({ count = 3, height = '116px' }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="skeleton" style={{ height, borderRadius: '18px', width: '100%' }} />
    ))}
  </div>
);

export default SkeletonList;
