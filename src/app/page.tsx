"use client";

import React, { useState } from 'react';
import { EditorCanvas } from '@/components/editor/EditorCanvas';
import { StackedFoldersNav } from '@/components/navigation/StackedFoldersNav';
import { PageFolderNav } from '@/components/navigation/PageFolderNav';
import { NodePropertiesDrawer } from '@/components/editor/NodePropertiesDrawer';
import { NodeLibraryModal } from '@/components/editor/NodeLibraryModal';
import { useFlowEngine } from '@/hooks/use-flow-engine';
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
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState('Flows');

  const selectedNode = flow.nodes.find(n => n.id === selectedNodeId) || null;

  const handleAddNode = (type: any, label: string) => {
    addNode(type, label, { x: 100, y: 150 });
    setIsLibraryOpen(false);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground relative">
      {/* Main Canvas - Full Screen */}
      <main className="absolute inset-0 z-0">
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

      {/* Main Navigation (Bottom Left) - Stacked Folders */}
      <div className="absolute bottom-6 left-6 z-50">
        <StackedFoldersNav 
          onOpenLibrary={() => setIsLibraryOpen(true)}
          nodeCount={flow.nodes.length}
        />
      </div>

      {/* Page Navigation (Bottom Right) - Folder */}
      <div className="absolute bottom-6 right-6 z-50">
        <PageFolderNav 
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Node Properties Drawer (Slides up from bottom) */}
      <NodePropertiesDrawer
        node={selectedNode}
        isOpen={!!selectedNodeId}
        onClose={() => setSelectedNodeId(null)}
        onUpdate={(updates) => selectedNodeId && updateNodeData(selectedNodeId, updates)}
        onDelete={() => {
          if (selectedNodeId) {
            removeNode(selectedNodeId);
            setSelectedNodeId(null);
          }
        }}
      />

      {/* Node Library Modal */}
      <NodeLibraryModal 
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onAddNode={handleAddNode}
      />

      <Toaster />
    </div>
  );
}
