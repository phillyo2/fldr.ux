
"use client";

import React, { useState } from 'react';
import { EditorSidebar } from '@/components/editor/EditorSidebar';
import { EditorCanvas } from '@/components/editor/EditorCanvas';
import { useFlowEngine } from '@/hooks/use-flow-engine';
import { generateCode } from '@/ai/flows/generate-code-from-flow';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      // Stringify the flow for GenAI
      const result = await generateCode({
        flowDiagram: JSON.stringify(flow, null, 2)
      });
      setGeneratedCode(result.javaScriptCode);
    } catch (err) {
      toast({
        title: "Generation Failed",
        description: "Could not generate code for this flow.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

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
        onGenerate={handleGenerate}
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
        
        {isGenerating && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
            <h2 className="text-xl font-headline font-bold">Synthesizing Logic...</h2>
            <p className="text-muted-foreground">AI is translating your flow into executable JavaScript</p>
          </div>
        )}
      </main>

      <Dialog open={!!generatedCode} onOpenChange={() => setGeneratedCode(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-headline text-2xl">Generated JavaScript</DialogTitle>
            <DialogDescription>
              This code represents the full implementation of your visual logic flow.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 bg-slate-900 rounded-lg p-6 mt-4">
            <pre className="text-slate-100 font-code text-sm leading-relaxed">
              <code>{generatedCode}</code>
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      <Toaster />
    </div>
  );
}
