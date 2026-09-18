import React from 'react';
import { Inbox } from 'lucide-react';

// Shared "nothing here" placeholder - same visual treatment already used
// ad hoc across Home/Discover/Saved, extracted for reuse.
const EmptyState = ({ icon: Icon = Inbox, title, description, maxWidth }) => (
  <div
    className="card-glass"
    style={{
      padding: '48px 20px',
      textAlign: 'center',
      borderRadius: '20px',
      color: 'var(--text-secondary)',
      maxWidth,
    }}
  >
    <Icon size={40} color="#5E6272" style={{ margin: '0 auto 14px' }} />
    {title && (
      <h4 style={{ color: 'var(--text-main)', fontSize: '16px', marginBottom: '6px' }}>{title}</h4>
    )}
    {description && (
      <p style={{ fontSize: '14px', maxWidth: '320px', margin: '0 auto' }}>{description}</p>
    )}
  </div>
);

export default EmptyState;
