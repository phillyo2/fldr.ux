
"use client";

import React from 'react';
import { Folder, Workflow, Database, Image as ImageIcon, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PageFolderNavProps {
  currentPage: string;
  onPageChange: (page: string) => void;
}

export const PageFolderNav: React.FC<PageFolderNavProps> = ({ currentPage, onPageChange }) => {
  const pages = [
    { name: 'Flows', icon: <Workflow className="w-4 h-4 mr-2" /> },
    { name: 'Data', icon: <Database className="w-4 h-4 mr-2" /> },
    { name: 'Assets', icon: <ImageIcon className="w-4 h-4 mr-2" /> },
    { name: 'Logs', icon: <Terminal className="w-4 h-4 mr-2" /> },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="w-16 h-16 rounded-2xl shadow-2xl border-2 border-accent/20 bg-white text-accent hover:bg-accent/5 active:scale-95"
        >
          <div className="flex flex-col items-center">
            <Folder className="w-7 h-7" />
            <span className="text-[10px] font-bold mt-0.5 uppercase tracking-tighter">
              {currentPage}
            </span>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="w-56 mb-4 p-2 rounded-2xl shadow-2xl border-2 animate-in slide-in-from-bottom-5 duration-300"
      >
        <DropdownMenuLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-3 py-2">
          Workspace Folders
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="grid grid-cols-2 gap-1 p-1">
          {pages.map((page) => (
            <DropdownMenuItem
              key={page.name}
              onClick={() => onPageChange(page.name)}
              className={cn(
                "flex flex-col items-center justify-center p-4 rounded-xl cursor-pointer transition-all border-2 border-transparent",
                currentPage === page.name 
                  ? "bg-accent/10 text-accent border-accent/20 font-bold" 
                  : "hover:bg-muted"
              )}
            >
              <div className="mb-1">{page.icon}</div>
              <span className="text-[10px] uppercase font-bold">{page.name}</span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
