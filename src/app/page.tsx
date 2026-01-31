"use client";

import React, { useState } from 'react';
import { EditorSidebar } from '@/components/editor/EditorSidebar';
import { EditorCanvas } from '@/components/editor/EditorCanvas';
import { useFlowEngine } from '@/hooks/use-flow-engine';
import { toast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';

export default function FldrUxEditor() {
  const {
    flow,
    addNode,
    updateNodePosition,
    updateNodeData,
    removeNode,
    connect,
    disconnect,
  } = useFlowEngine();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(flow));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "flow-export.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    toast({
      title: "Flow Exported",
      description: "Successfully exported flow as JSON."
    });
  };

  const selectedNode = flow.nodes.find(n => n.id === selectedNodeId) || null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <EditorSidebar
        selectedNode={selectedNode}
        onAddNode={(type, label) => addNode(type, label, { x: 200, y: 200 })}
        onUpdateNode={updateNodeData}
        onDeleteNode={removeNode}
        onExport={handleExport}
      />
      
      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        <EditorCanvas
          flow={flow}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onUpdatePosition={updateNodePosition}
          onDeleteNode={removeNode}
          onConnect={connect}
          onDisconnect={disconnect}
        />
      </main>
      <Toaster />
    </div>
  );
}