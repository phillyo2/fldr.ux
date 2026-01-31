"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { NodeType } from '@/lib/types';
import { Zap, Box, Play, Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface NodeLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddNode: (type: NodeType, label: string) => void;
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

export const NodeLibraryModal: React.FC<NodeLibraryModalProps> = ({ isOpen, onClose, onAddNode }) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] h-[70vh] flex flex-col p-0 overflow-hidden border-2 rounded-2xl">
        <DialogHeader className="p-6 border-b">
          <DialogTitle className="text-2xl font-headline font-bold text-primary">Add New Node</DialogTitle>
          <DialogDescription>Select a component to add to your flow</DialogDescription>
        </DialogHeader>
        <div className="p-4 border-b bg-muted/20">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search components..." className="pl-10 h-10 rounded-xl bg-white" />
          </div>
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="grid grid-cols-1 gap-3 pb-8">
            {nodeTemplates.map((tpl, i) => (
              <button
                key={i}
                onClick={() => onAddNode(tpl.type, tpl.label)}
                className="flex items-center justify-between p-4 rounded-xl border-2 bg-white hover:border-primary hover:bg-primary/5 transition-all group text-left"
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "p-3 rounded-xl",
                    tpl.type === 'trigger' ? "bg-accent/10 text-accent" :
                    tpl.type === 'logic' ? "bg-primary/10 text-primary" : "bg-green-500/10 text-green-600"
                  )}>
                    {tpl.icon}
                  </div>
                  <div>
                    <span className="text-sm font-bold block">{tpl.label}</span>
                    <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-tight">{tpl.type}</span>
                  </div>
                </div>
                <Plus className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
