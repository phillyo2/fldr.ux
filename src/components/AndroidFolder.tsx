
"use client";

import React from 'react';
import { SafeIcon } from './SafeIcon';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { FolderData, CanvasItem } from '@/lib/types';
import { ICON_SIZE } from '@/lib/constants';

interface AndroidFolderProps {
  fId?: string;
  index: number;
  isMain?: boolean;
  registry: Record<string, FolderData>;
  activeView: string | null;
  onOpen: (id: string | null) => void;
  onLaunch?: (id: string) => void;
  onBirth?: (item: Partial<CanvasItem>) => void;
  windowSize: { w: number; h: number };
  simulatedOffset: number;
  isStackedItem?: boolean;
  isDraggingDrawer?: boolean;
}

export const AndroidFolder: React.FC<AndroidFolderProps> = ({ 
  fId, 
  index, 
  isMain = false, 
  registry, 
  activeView, 
  onOpen, 
  onLaunch, 
  onBirth, 
  windowSize, 
  simulatedOffset,
  isStackedItem = false,
  isDraggingDrawer = false
}) => {
    const data = isMain ? { icon: 'Zap', title: 'Launcher', color: 'bg-slate-900', items: [] } : (fId ? registry[fId] : null);
    if (!data) return null;
    
    const isExpanded = activeView === (isMain ? 'launcher' : fId);
    
    // CSS-driven positioning:
    // Collapsed: index * 4 (slight overlap)
    // Expanded: index * 58 (full spread)
    const stackSpread = simulatedOffset;
    const bottomValue = isMain ? 40 : 40 + (index * stackSpread * 52) + (index * 6);
    
    // We use bottom instead of top for stability and performance
    const style: React.CSSProperties = isExpanded 
      ? { 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          width: '100%', 
          height: '100%', 
          borderRadius: 0, 
          zIndex: 500,
          transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
        } 
      : { 
          position: 'fixed', 
          bottom: `${bottomValue}px`, 
          left: isMain ? 'auto' : '40px',
          right: isMain ? '40px' : 'auto',
          width: '48px', 
          height: '48px', 
          borderRadius: '0.75rem', 
          zIndex: 100 - index,
          transition: isDraggingDrawer ? 'none' : 'bottom 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.2s ease-out'
        };

    return (
      <div 
        style={style}
        className={`shadow-2xl overflow-hidden ${isExpanded ? 'bg-white/95 backdrop-blur-3xl' : `${data.color} cursor-pointer border-t border-white/20`} flex items-center justify-center text-white group`} 
        onClick={(e) => { e.stopPropagation(); if (isExpanded) return; onOpen(isMain ? 'launcher' : (fId || null)); }}>
        
        {!isMain && !isExpanded && index === 0 && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 text-slate-400 group-hover:text-slate-600 transition-colors pointer-events-none flex flex-col items-center">
                {simulatedOffset < 0.5 ? (
                  <div className="animate-bounce flex flex-col items-center">
                    <ChevronUp size={20} className="stroke-[3]" />
                    <span className="text-[7px] font-black uppercase tracking-[0.2em] -mt-1 bg-white/80 px-1 rounded shadow-sm border border-slate-100">Pull</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center opacity-70">
                    <ChevronDown size={20} className="stroke-[3]" />
                    <span className="text-[7px] font-black uppercase tracking-[0.2em] -mt-1 bg-white/80 px-1 rounded shadow-sm border border-slate-100">Push</span>
                  </div>
                )}
            </div>
        )}

        <div className={`absolute transition-all duration-200 flex items-center justify-center z-50 ${isExpanded ? 'top-12 left-12 w-16 h-16 bg-slate-100 rounded-2xl text-blue-600 shadow-md' : 'inset-0'}`} onClick={(e) => { if(isExpanded) { e.stopPropagation(); onOpen(null); } }}>
          <SafeIcon name={data.icon} fill={isExpanded ? "none" : "currentColor"} size={ICON_SIZE} />
        </div>
        
        <div className={`w-full h-full p-8 pt-32 overflow-y-auto grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-8 content-start justify-items-center transition-all duration-300 ${isExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
           { (isMain ? [{id:'studio', name:'Studio', icon:'LayoutTemplate'}, {id:'home', name:'Dashboard', icon:'Home'}] : (data.items || [])).map((item, i) => (
              <div key={i} className="flex flex-col items-center group cursor-pointer active:scale-95 transition-all" onClick={(e) => { e.stopPropagation(); if (isMain && onLaunch) onLaunch(item.id!); else if (onBirth) onBirth(item); }}>
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all shadow-sm ${isMain ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white'}`}>
                    <SafeIcon name={item.icon || 'Zap'} size={ICON_SIZE} />
                </div>
                <span className="mt-3 text-[10px] font-black uppercase text-slate-400 group-hover:text-slate-900 text-center truncate w-full">{item.name}</span>
              </div>
           ))}
        </div>

        { !isMain && isExpanded && (
             <div className="absolute bottom-6 left-1/2 -translate-x-1/2 opacity-50 cursor-pointer" onClick={() => onOpen(null)}>
                 <ChevronDown size={32} className="stroke-[3]" />
             </div>
        )}
      </div>
    );
};
