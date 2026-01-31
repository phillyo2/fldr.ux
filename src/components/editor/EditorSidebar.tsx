"use client";

import React from 'react';
import { NodeType, LogicNode } from '@/lib/types';
import { Zap, Play, Box, Search, Plus, Trash2, Download, Layers, Settings2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface SidebarProps {
  selectedNode: LogicNode | null;
  onAddNode: (type: NodeType, label: string) => void;
  onUpdateNode: (nodeId: string, updates: Partial<LogicNode>) => void;
  onDeleteNode: (nodeId: string) => void;
  onExport: () => void;
}

const nodeTemplates = [
  { type: 'trigger' as const, label: 'HTTP Request', icon: <Zap className="w-4 h-4" /> },
  { type: 'trigger' as const, label: 'User Login', icon: <Zap className="w-4 h-4" /> },
  { type: 'logic' as const, label: 'Conditional', icon: <Box className="w-4 h-4" /> },
  { type: 'logic' as const, label: 'Loop Array', icon: <Box className="w-4 h-4" /> },
  { type: 'logic' as const, label: 'Transform JSON', icon: <Box className="w-4 h-4" /> },
  { type: 'action' as const, label: 'Send Email', icon: <Play className="w-4 h-4" /> },
  { type: 'action' as const, label: 'Update DB', icon: <Play className="w-4 h-4" /> },
  { type: 'action' as const, label: 'Log Event', icon: <Play className="w-4 h-4" /> },
];

export const EditorSidebar: React.FC<SidebarProps> = ({
  selectedNode,
  onAddNode,
  onUpdateNode,
  onDeleteNode,
  onExport
}) => {
  return (
    <div className="w-80 border-r bg-sidebar h-full flex flex-col shrink-0">
      <div className="p-4 border-b bg-sidebar-accent/10">
        <h1 className="text-xl font-headline font-bold text-primary flex items-center gap-2">
          <Layers className="w-5 h-5" /> fldr.ux
        </h1>
      </div>

      <Tabs defaultValue="library" className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-2 mx-4 mt-4">
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="properties">Properties</TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="flex-1 p-0 overflow-hidden">
          <div className="p-4 space-y-4 h-full flex flex-col">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search nodes..." className="pl-8 bg-white" />
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-6 pb-20">
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Node Types</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {nodeTemplates.map((tpl, i) => (
                      <button
                        key={i}
                        onClick={() => onAddNode(tpl.type, tpl.label)}
                        className="flex items-center justify-between p-3 rounded-lg border bg-white hover:border-primary hover:shadow-sm transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-md",
                            tpl.type === 'trigger' ? "bg-accent/10 text-accent" :
                            tpl.type === 'logic' ? "bg-primary/10 text-primary" : "bg-green-500/10 text-green-600"
                          )}>
                            {tpl.icon}
                          </div>
                          <span className="text-sm font-medium">{tpl.label}</span>
                        </div>
                        <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        <TabsContent value="properties" className="flex-1 p-0 overflow-hidden">
          <ScrollArea className="h-full">
            {selectedNode ? (
              <div className="p-4 space-y-6">
                <div className="space-y-2">
                  <Label>Identity (Label)</Label>
                  <Input 
                    value={selectedNode.label} 
                    onChange={(e) => onUpdateNode(selectedNode.id, { label: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Payload Schema (JSON)</Label>
                  <Textarea 
                    placeholder='{"type": "object", ...}' 
                    className="font-code text-xs h-32"
                    value={selectedNode.payloadSchema || ''}
                    onChange={(e) => onUpdateNode(selectedNode.id, { payloadSchema: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Custom Logic (JavaScript)</Label>
                  <Textarea 
                    placeholder="function onExecute(data) { ... }" 
                    className="font-code text-xs h-48"
                    value={selectedNode.customCode || ''}
                    onChange={(e) => onUpdateNode(selectedNode.id, { customCode: e.target.value })}
                  />
                  <p className="text-[10px] text-muted-foreground italic">Deployed to edge compute automatically.</p>
                </div>

                <div className="pt-4 border-t flex flex-col gap-2">
                  <Button variant="destructive" size="sm" onClick={() => onDeleteNode(selectedNode.id)} className="w-full">
                    <Trash2 className="w-4 h-4 mr-2" /> Delete Node
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center opacity-50">
                <Settings2 className="w-12 h-12 mb-2" />
                <p className="text-sm">Select a node on the canvas to edit its properties.</p>
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <div className="p-4 border-t bg-white mt-auto">
        <Button variant="outline" onClick={onExport} className="w-full">
          <Download className="w-4 h-4 mr-2" /> Export Flow
        </Button>
      </div>
    </div>
  );
};