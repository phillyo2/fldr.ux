
"use client";

import React, { useState } from 'react';
import { SafeIcon } from './SafeIcon';
import { ChevronLeft, X } from 'lucide-react';
import { FolderItem } from '@/lib/types';
import { ICON_SIZE } from '@/lib/constants';

interface AndroidFolderProps {
  title: string;
  icon: string;
  color: string;
  items: FolderItem[];
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: FolderItem) => void;
}

export const AndroidFolder: React.FC<AndroidFolderProps> = ({ 
  title, 
  icon, 
  color, 
  items, 
  isOpen, 
  onClose,
  onSelect
}) => {
    const [path, setPath] = useState<FolderItem[]>([]);
    
    if (!isOpen) return null;

    const currentItems = path.length > 0 ? path[path.length - 1].items || [] : items;
    const currentTitle = path.length > 0 ? path[path.length - 1].name : title;

    const handleBack = () => {
      setPath(prev => prev.slice(0, -1));
    };

    return (
      <div className="fixed inset-0 z-[1000] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className={`${color} p-6 text-white flex items-center justify-between`}>
            <div className="flex items-center gap-4">
              {path.length > 0 && (
                <button onClick={handleBack} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <ChevronLeft size={20} />
                </button>
              )}
              <div className="flex items-center gap-3">
                <SafeIcon name={path.length > 0 ? (path[path.length - 1].icon || 'Folder') : icon} size={20} />
                <span className="font-black uppercase tracking-widest text-xs">{currentTitle}</span>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Grid Content */}
          <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-6 justify-items-center">
              {currentItems.map((item, i) => (
                <div 
                  key={i} 
                  className="flex flex-col items-center group cursor-pointer active:scale-95 transition-all w-20"
                  onClick={() => {
                    if (item.isFolder) {
                      setPath(prev => [...prev, item]);
                    } else {
                      onSelect(item);
                    }
                  }}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all shadow-sm ${item.isFolder ? 'bg-slate-200 text-slate-500' : 'bg-white text-slate-400 group-hover:bg-blue-600 group-hover:text-white border border-slate-100'}`}>
                    <SafeIcon name={item.icon || (item.isFolder ? 'Folder' : 'Zap')} size={20} />
                  </div>
                  <span className="mt-2 text-[8px] font-black uppercase text-slate-400 group-hover:text-slate-900 text-center truncate w-full tracking-tighter">
                    {item.name}
                  </span>
                </div>
              ))}
              {currentItems.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest italic">
                  Folder is Empty
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
};
