"use client";

import React, { useRef, useEffect, useState } from 'react';
import { LogicNode } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Settings2, X, Play, Zap, Box, Code } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface NodeProps {
  node: LogicNode;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUpdatePosition: (x: number, y: number) => void;
  onStartConnection: (nodeId: string, portId: string, portType: string) => void;
  onCompleteConnection: (nodeId: string, portId: string, portType: string) => void;
  onOpenProperties: () => void;
}

export const NodeElement: React.FC<NodeProps> = ({
  node,
  isSelected,
  onSelect,
  onDelete,
  onUpdatePosition,
  onStartConnection,
  onCompleteConnection,
  onOpenProperties
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.port-handle')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - node.position.x,
      y: e.clientY - node.position.y
    });
    onSelect();
    e.stopPropagation();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      onUpdatePosition(e.clientX - dragOffset.x, e.clientY - dragOffset.y);
    };
    const handleMouseUp = () => setIsDragging(false);
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, onUpdatePosition]);

  const getIcon = () => {
    switch (node.type) {
      case 'trigger': return <Zap className="w-4 h-4 text-accent" />;
      case 'logic': return <Box className="w-4 h-4 text-primary" />;
      case 'action': return <Play className="w-4 h-4 text-green-500" />;
      default: return <Settings2 className="w-4 h-4" />;
    }
  };

  return (
    <div
      ref={nodeRef}
      className={cn("absolute cursor-grab active:cursor-grabbing transition-shadow", isDragging && "z-50")}
      style={{ left: node.position.x, top: node.position.y }}
      onMouseDown={handleMouseDown}
    >
      <Card className={cn(
        "min-w-[180px] overflow-visible border-2 transition-all duration-200",
        isSelected ? "border-primary shadow-xl ring-2 ring-primary/20 scale-[1.02]" : "border-border shadow-sm hover:border-primary/50"
      )}>
        <div className="flex items-center justify-between p-2 bg-muted/30 border-b">
          <div className="flex items-center gap-2">
            {getIcon()}
            <span className="text-xs font-headline font-bold uppercase tracking-wider">{node.type}</span>
          </div>
          <div className="flex gap-1">
            <button onClick={onOpenProperties} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-primary transition-colors">
              <Settings2 className="w-3 h-3" />
            </button>
            <button onClick={onDelete} className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
        <div className="p-3">
          <h3 className="text-sm font-semibold">{node.label}</h3>
          {node.customCode && (
            <div className="mt-1 flex items-center gap-1">
              <Badge variant="outline" className="text-[10px] py-0 px-1 border-primary/20 bg-primary/5 text-primary">
                <Code className="w-2 h-2 mr-1" /> Custom Code
              </Badge>
            </div>
          )}
        </div>
        <div className="flex justify-between px-0 relative pb-2">
          <div className="flex flex-col gap-2 -ml-2.5">
            {node.inputs.map(port => (
              <div key={port.id} className="group flex items-center gap-2 relative">
                <div 
                  className="port-handle w-5 h-5 rounded-full border-2 border-background bg-border hover:bg-accent hover:border-accent hover:scale-125 transition-all cursor-crosshair"
                  onMouseDown={(e) => { e.stopPropagation(); onCompleteConnection(node.id, port.id, port.type); }}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 -mr-2.5 items-end">
            {node.outputs.map(port => (
              <div key={port.id} className="group flex items-center gap-2 relative">
                <div 
                  className="port-handle w-5 h-5 rounded-full border-2 border-background bg-border hover:bg-primary hover:border-primary hover:scale-125 transition-all cursor-crosshair"
                  onMouseDown={(e) => { e.stopPropagation(); onStartConnection(node.id, port.id, port.type); }}
                />
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};
