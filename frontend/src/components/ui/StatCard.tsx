import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  color?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  description,
  icon: Icon,
  color = '#4f46e5',
}) => {
  return (
    <div className="stat-card">
      <div className="stat-header">
        <span>{title}</span>
        <div className="stat-icon" style={{ backgroundColor: `${color}15`, color }}>
          <Icon size={18} />
        </div>
      </div>
      <div className="stat-value">{value}</div>
      {description && <div className="stat-desc">{description}</div>}
    </div>
  );
};
