import React from 'react';

interface StatusBadgeProps {
  status: 'active' | 'completed' | 'overdue';
  children: React.ReactNode;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, children }) => {
  const getStatusStyles = () => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 text-green-400';
      case 'completed':
        return 'bg-slate-500/20 text-slate-400';
      case 'overdue':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-slate-500/20 text-slate-400';
    }
  };

  return (
    <span
      className={`
        text-xs uppercase tracking-[0.04em] px-2.5 py-0.5 rounded-full
        ${getStatusStyles()}
      `}
    >
      {children}
    </span>
  );
};

export default StatusBadge;
