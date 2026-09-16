import React from 'react';
import { EnquiryStatus, QuotationStatus, SalesOrderStatus } from '../../types';

interface BadgeProps {
  status: EnquiryStatus | QuotationStatus | SalesOrderStatus | string;
}

export const Badge: React.FC<BadgeProps> = ({ status }) => {
  const normalized = status.toLowerCase();
  const badgeClass = `badge badge-${normalized}`;

  return <span className={badgeClass}>{status}</span>;
};
