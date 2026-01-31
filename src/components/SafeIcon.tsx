
"use client";

import React from 'react';
import * as LucideIcons from 'lucide-react';

interface SafeIconProps {
  name: string;
  size?: number;
  className?: string;
  fill?: string;
}

export const SafeIcon: React.FC<SafeIconProps> = ({ name, size = 18, className = "", fill = "none" }) => {
  // @ts-ignore
  const IconRef = LucideIcons[name] || LucideIcons.Zap;
  return <IconRef size={size} className={className} fill={fill} />;
};
