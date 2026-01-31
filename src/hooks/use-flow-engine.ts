
"use client";

import { useState, useCallback } from 'react';
import { LogicFlow, LogicNode, LogicConnection, NodeType } from '@/lib/types';

export function useFlowEngine() {
  const [flow, setFlow] = useState<LogicFlow>({
    nodes: [
      {
        id: 'start-trigger',
        type: 'trigger',
        label: 'App Started',
        position: { x: 100, y: 100 },
        inputs: [],
        outputs: [{ id: 'out-1', name: 'Trigger', type: 'signal', direction: 'output' }],
        properties: { identity: 'app_start' }
      }
    ],
    connections: []
  });

  const addNode = useCallback((type: NodeType, label: string, position: { x: number; y: number }) => {
    const newNode: LogicNode = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      label,
      position,
      inputs: type !== 'trigger' ? [{ id: 'in-' + Date.now(), name: 'Input', type: 'any', direction: 'input' }] : [],
      outputs: type !== 'action' ? [{ id: 'out-' + Date.now(), name: 'Output', type: 'any', direction: 'output' }] : [],
      properties: {}
    };
    setFlow(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));
  }, []);

  const updateNodePosition = useCallback((nodeId: string, position: { x: number; y: number }) => {
    setFlow(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, position } : n)
    }));
  }, []);

  const updateNodeData = useCallback((nodeId: string, updates: Partial<LogicNode>) => {
    setFlow(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n)
    }));
  }, []);

  const removeNode = useCallback((nodeId: string) => {
    setFlow(prev => ({
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      connections: prev.connections.filter(c => c.sourceId !== nodeId && c.targetId !== nodeId)
    }));
  }, []);

  const connect = useCallback((sourceId: string, sourcePortId: string, targetId: string, targetPortId: string) => {
    const newConn: LogicConnection = {
      id: `${sourceId}-${sourcePortId}-${targetId}-${targetPortId}`,
      sourceId,
      sourcePortId,
      targetId,
      targetPortId
    };
    setFlow(prev => ({
      ...prev,
      connections: [...prev.connections, newConn]
    }));
  }, []);

  const disconnect = useCallback((connectionId: string) => {
    setFlow(prev => ({
      ...prev,
      connections: prev.connections.filter(c => c.id !== connectionId)
    }));
  }, []);

  return {
    flow,
    addNode,
    updateNodePosition,
    updateNodeData,
    removeNode,
    connect,
    disconnect,
    setFlow
  };
}
