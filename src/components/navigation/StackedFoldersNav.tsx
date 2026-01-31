
"use client";

import React, { useState } from 'react';
import { Plus, Layers, MousePointer2, Settings, ChevronUp, Files } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface StackedFoldersNavProps {
  onOpenLibrary: () => void;
  nodeCount: number;
}

export const StackedFoldersNav: React.FC<StackedFoldersNavProps> = ({ 
  onOpenLibrary,
  nodeCount 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const navItems = [
    { icon: <Plus className="w-5 h-5" />, label: 'Add Node', action: onOpenLibrary, color: 'text-primary' },
    { icon: <Layers className="w-5 h-5" />, label: 'Nodes', action: () => {}, badge: nodeCount },
    { icon: <MousePointer2 className="w-5 h-5" />, label: 'Select', action: () => {} },
    { icon: <Settings className="w-5 h-5" />, label: 'Settings', action: () => {} },
  ];

  return (
    <div className="flex flex-col items-start gap-3">
      {/* Expanded Stack */}
      <div className={cn(
        "flex flex-col gap-2 transition-all duration-300 origin-bottom",
        isExpanded ? "scale-100 opacity-100 mb-2" : "scale-0 opacity-0 h-0 overflow-hidden"
      )}>
        {navItems.map((item, idx) => (
          <Button
            key={idx}
            variant="secondary"
            size="icon"
            className="w-14 h-14 rounded-2xl shadow-lg border-2 border-white bg-white hover:bg-muted relative"
            onClick={() => {
              item.action();
              setIsExpanded(false);
            }}
          >
            <div className={item.color}>{item.icon}</div>
            {item.badge !== undefined && (
              <Badge className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[10px] min-w-[20px] h-5 flex items-center justify-center">
                {item.badge}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      {/* Main Trigger Folder */}
      <Button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-16 h-16 rounded-2xl shadow-2xl border-2 border-primary/20 transition-all active:scale-95",
          isExpanded ? "bg-primary text-white" : "bg-white text-primary"
        )}
      >
        <div className="flex flex-col items-center">
          <Files className={cn("w-7 h-7", isExpanded ? "animate-bounce" : "")} />
          <span className="text-[10px] font-bold mt-0.5">MENU</span>
        </div>
      </Button>
    </div>
  );
};
