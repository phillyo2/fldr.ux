
"use client";

import React, { useState } from 'react';
import { Plus, Layers, MousePointer2, Settings, Files, X } from 'lucide-react';
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
    { icon: <Plus className="w-5 h-5" />, label: 'Add Node', action: onOpenLibrary, color: 'text-primary', delay: 'delay-0' },
    { icon: <Layers className="w-5 h-5" />, label: 'Nodes', action: () => {}, badge: nodeCount, color: 'text-accent', delay: 'delay-75' },
    { icon: <MousePointer2 className="w-5 h-5" />, label: 'Select', action: () => {}, color: 'text-indigo-500', delay: 'delay-100' },
    { icon: <Settings className="w-5 h-5" />, label: 'Settings', action: () => {}, color: 'text-slate-500', delay: 'delay-150' },
  ];

  return (
    <div className="flex flex-col items-start relative min-h-[80px] min-w-[80px]">
      {/* The Stacked "Books" - Expanding upwards */}
      <div className="absolute bottom-0 left-0 w-full h-full flex flex-col items-center">
        {navItems.map((item, idx) => {
          // Calculate vertical offset for the "stacked" look
          const bottomOffset = isExpanded ? (idx + 1) * 70 : idx * 4;
          const zIndex = 40 - idx;
          const scale = isExpanded ? 1 : 1 - (idx * 0.05);
          
          return (
            <button
              key={idx}
              onClick={() => {
                item.action();
                setIsExpanded(false);
              }}
              style={{ 
                bottom: `${bottomOffset}px`,
                zIndex: zIndex,
                transform: `scale(${scale})`,
              }}
              className={cn(
                "absolute transition-all duration-500 ease-out flex items-center justify-center",
                "w-14 h-14 rounded-2xl shadow-xl border-2 border-white/80 bg-white",
                "hover:bg-muted active:scale-95",
                !isExpanded && idx > 0 && "pointer-events-none opacity-0"
              )}
            >
              <div className={cn(item.color, "flex flex-col items-center")}>
                {item.icon}
                {isExpanded && (
                  <span className="text-[8px] font-bold mt-0.5 uppercase tracking-tighter">
                    {item.label.split(' ')[0]}
                  </span>
                )}
              </div>
              {item.badge !== undefined && (
                <Badge className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[10px] min-w-[20px] h-5 flex items-center justify-center bg-primary text-primary-foreground">
                  {item.badge}
                </Badge>
              )}
            </button>
          );
        })}

        {/* Main Trigger - The "Folder" base */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            "z-50 w-16 h-16 rounded-2xl shadow-2xl border-2 border-primary/20 transition-all active:scale-95",
            isExpanded ? "bg-primary text-white" : "bg-white text-primary"
          )}
        >
          <div className="flex flex-col items-center justify-center">
            {isExpanded ? (
              <X className="w-7 h-7 animate-in fade-in zoom-in duration-300" />
            ) : (
              <Files className="w-7 h-7" />
            )}
            <span className="text-[10px] font-bold mt-0.5 tracking-widest uppercase">
              {isExpanded ? 'CLOSE' : 'MENU'}
            </span>
          </div>
        </button>
      </div>
    </div>
  );
};
