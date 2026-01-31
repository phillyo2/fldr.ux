
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { LogicFlow, LogicNode, LogicConnection } from '@/lib/types';
import { NodeElement } from './NodeElement';
import { suggestNodeConnections } from '@/ai/flows/suggest-node-connections';
import { toast } from '@/hooks/use-toast';

interface CanvasProps {
  flow: LogicFlow;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onDeleteNode: (id: string) => void;
  onConnect: (sourceId: string, sourcePortId: string, targetId: string, targetPortId: string) => void;
  onDisconnect: (connectionId: string) => void;
}

export const EditorCanvas: React.FC<CanvasProps> = ({
  flow,
  selectedNodeId,
  onSelectNode,
  onUpdatePosition,
  onDeleteNode,
  onConnect,
  onDisconnect
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeConnection, setActiveConnection] = useState<{
    sourceId: string;
    sourcePortId: string;
    portType: string;
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });
    
    if (activeConnection) {
      setActiveConnection(prev => prev ? { ...prev, mouseX: x, mouseY: y } : null);
    }
  };

  const handleStartConnection = (nodeId: string, portId: string, portType: string) => {
    setActiveConnection({
      sourceId: nodeId,
      sourcePortId: portId,
      portType: portType,
      mouseX: mousePos.x,
      mouseY: mousePos.y
    });
  };

  const handleCompleteConnection = async (targetNodeId: string, targetPortId: string, targetPortType: string) => {
    if (!activeConnection) return;
    
    // Self connection prevention
    if (activeConnection.sourceId === targetNodeId) {
      setActiveConnection(null);
      return;
    }

    // AI Check for smart suggestions
    const sourceNode = flow.nodes.find(n => n.id === activeConnection.sourceId);
    const targetNode = flow.nodes.find(n => n.id === targetNodeId);

    if (sourceNode && targetNode) {
      const suggestion = await suggestNodeConnections({
        sourceNodeType: sourceNode.type,
        targetNodeType: targetNode.type,
        sourcePortType: activeConnection.portType,
        targetPortType: targetPortType
      });

      if (!suggestion.isValidConnection) {
        toast({
          title: "Incompatible Connection",
          description: suggestion.reason || "These nodes cannot be connected.",
          variant: "destructive"
        });
        setActiveConnection(null);
        return;
      }
    }

    onConnect(activeConnection.sourceId, activeConnection.sourcePortId, targetNodeId, targetPortId);
    setActiveConnection(null);
  };

  const getPortPosition = (nodeId: string, portId: string, direction: 'input' | 'output') => {
    const node = flow.nodes.find(n => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    
    // Find index of port
    const portIndex = direction === 'input' 
      ? node.inputs.findIndex(p => p.id === portId)
      : node.outputs.findIndex(p => p.id === portId);
    
    const x = direction === 'input' ? node.position.x : node.position.x + 180;
    const y = node.position.y + 70 + (portIndex * 28); // Adjusted for UI
    
    return { x, y };
  };

  return (
    <div 
      ref={containerRef}
      className="flex-1 relative overflow-hidden canvas-grid bg-background select-none h-full"
      onMouseMove={handleMouseMove}
      onMouseDown={() => onSelectNode(null)}
      onMouseUp={() => setActiveConnection(null)}
    >
      <svg className="absolute inset-0 pointer-events-none w-full h-full">
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="10"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--primary))" />
          </marker>
        </defs>

        {/* Existing Connections */}
        {flow.connections.map(conn => {
          const start = getPortPosition(conn.sourceId, conn.sourcePortId, 'output');
          const end = getPortPosition(conn.targetId, conn.targetPortId, 'input');
          const midX = (start.x + end.x) / 2;
          
          return (
            <g key={conn.id}>
              <path
                d={`M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2.5"
                markerEnd="url(#arrowhead)"
                className="transition-all hover:stroke-accent cursor-pointer pointer-events-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  onDisconnect(conn.id);
                }}
              />
            </g>
          );
        })}

        {/* Active Connection Wire */}
        {activeConnection && (() => {
          const start = getPortPosition(activeConnection.sourceId, activeConnection.sourcePortId, 'output');
          const midX = (start.x + activeConnection.mouseX) / 2;
          return (
            <path
              d={`M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${activeConnection.mouseY}, ${activeConnection.mouseX} ${activeConnection.mouseY}`}
              fill="none"
              stroke="hsl(var(--accent))"
              strokeWidth="2.5"
              strokeDasharray="5,5"
              className="animate-pulse-subtle"
            />
          );
        })()}
      </svg>

      {flow.nodes.map(node => (
        <NodeElement
          key={node.id}
          node={node}
          isSelected={selectedNodeId === node.id}
          onSelect={() => onSelectNode(node.id)}
          onDelete={() => onDeleteNode(node.id)}
          onUpdatePosition={(x, y) => onUpdatePosition(node.id, x, y)}
          onStartConnection={handleStartConnection}
          onCompleteConnection={handleCompleteConnection}
          onOpenProperties={() => onSelectNode(node.id)}
        />
      ))}
    </div>
  );
};
