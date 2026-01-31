"use client";

import React from 'react';
import { LogicNode } from '@/lib/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Trash2, Save, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  node: LogicNode | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updates: Partial<LogicNode>) => void;
  onDelete: () => void;
}

export const NodePropertiesDrawer: React.FC<Props> = ({ node, isOpen, onClose, onUpdate, onDelete }) => {
  if (!node) return null;
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="h-[80vh] sm:h-[60vh] rounded-t-[2rem] border-t-4 border-primary/20">
        <SheetHeader className="flex flex-row items-center justify-between pb-4 border-b">
          <div>
            <SheetTitle className="text-2xl font-headline font-bold text-primary">{node.label}</SheetTitle>
            <SheetDescription className="text-xs uppercase tracking-widest font-bold opacity-70">Type: {node.type}</SheetDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full"><X className="w-6 h-6" /></Button>
        </SheetHeader>
        <ScrollArea className="flex-1 py-6 h-[calc(100%-120px)]">
          <div className="space-y-6 pb-20">
            <div className="space-y-2">
              <Label className="text-sm font-bold">Identity (Label)</Label>
              <Input value={node.label} onChange={(e) => onUpdate({ label: e.target.value })} className="h-12 text-lg rounded-xl border-2" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold">Payload Schema (JSON)</Label>
              <Textarea placeholder='{"type": "object", ...}' className="font-code text-xs h-32 rounded-xl border-2" value={node.payloadSchema || ''} onChange={(e) => onUpdate({ payloadSchema: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-bold">Custom Logic (JavaScript)</Label>
              <Textarea placeholder="function onExecute(data) { ... }" className="font-code text-xs h-48 rounded-xl border-2" value={node.customCode || ''} onChange={(e) => onUpdate({ customCode: e.target.value })} />
            </div>
          </div>
        </ScrollArea>
        <SheetFooter className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background to-transparent border-t flex-row gap-4">
          <Button variant="destructive" className="flex-1 h-12 rounded-xl" onClick={onDelete}><Trash2 className="w-4 h-4 mr-2" /> Delete</Button>
          <Button className="flex-1 h-12 rounded-xl" onClick={onClose}><Save className="w-4 h-4 mr-2" /> Done</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
