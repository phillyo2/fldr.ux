"use client";

import React, { useState, useRef, useEffect } from 'react';
import { LayoutGrid, Waypoints, Folder, Plus, Minus, Settings, Compass, Zap, Package, Radio, Code2, Terminal, ChevronRight, ChevronLeft, LayoutTemplate, Home, Shuffle, Shield, Activity, Globe, Bell, Send, Cpu, Layers, Clock, HardDrive, GitBranch, Timer, Repeat, X } from 'lucide-react';
import { SafeIcon } from '@/components/SafeIcon';
import { 
  CanvasItem, Connection, FolderData, FolderItem 
} from '@/lib/types';
import { 
  HEADER_OFFSET, SNAP_TOLERANCE, DETECTION_RANGE, 
  DRAG_THRESHOLD, LONG_PRESS_MS, LATCH_POINTS, GRID_SIZE 
} from '@/lib/constants';
import { getSmartPath, snapToGrid } from '@/lib/pathing';
import { calculateGhostHandshakes, getPortState } from '@/lib/handshake-engine';

export default function App() {
  // --- STATE ---
  const [currentPageId, setCurrentPageId] = useState('studio');
  const [activeFolderView, setActiveFolderView] = useState<'nav' | 'toolbox' | null>(null);
  const [windowSize, setWindowSize] = useState({ w: 1024, h: 768 });
  const [isReady, setIsReady] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'grid' | 'tether'>('grid');
  
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]); 
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const [isDragging, setIsDragging] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null); 
  const [isPanning, setIsPanning] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{id: string, x: number, y: number} | null>(null); 

  const [activeTether, setActiveTether] = useState<Connection | null>(null); 

  const toolboxData: FolderData = {
    id: 'toolbox',
    title: 'Toolbox',
    icon: 'Package',
    color: 'bg-slate-900',
    items: [
      { name: 'New Action', icon: 'Plus', isBuilder: true },
      { name: 'Actions', icon: 'Zap', isFolder: true, items: [
        { name: 'Logic', icon: 'Code2', isFolder: true, items: [
            { name: 'Circuit Breaker', icon: 'Shuffle', isBuilder: true }
        ] },
        { name: 'Triggers', icon: 'Radio', isFolder: true, items: [
            { name: 'Entry Point', icon: 'Shield', isTrigger: true, isBuilder: true }
        ] }
      ] },
      { name: 'Modifiers', icon: 'Settings', isFolder: true, color: 'bg-amber-500', items: [
        { name: 'Env Vars', icon: 'Globe', isBuilder: true },
        { name: 'RBAC', icon: 'Shield', isBuilder: true },
        { name: 'Config', icon: 'Settings', isBuilder: true }
      ]}
    ]
  };

  const navData: FolderData = {
    id: 'nav',
    title: 'Navigator',
    icon: 'Compass',
    color: 'bg-blue-600',
    items: [
      { name: 'Studio', icon: 'LayoutTemplate', id: 'studio' },
      { name: 'Dashboard', icon: 'Home', id: 'home' }
    ]
  };

  const itemsRef = useRef(canvasItems);
  const connRef = useRef(connections);
  useEffect(() => { itemsRef.current = canvasItems; }, [canvasItems]);
  useEffect(() => { connRef.current = connections; }, [connections]);

  const mouseOffset = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const panOffsetStart = useRef({ x: 0, y: 0 });
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  const [editingItem, setEditingItem] = useState<CanvasItem | null>(null);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [studioName, setStudioName] = useState("");
  const [studioIcon, setStudioIcon] = useState("Terminal");
  const [studioPayload, setStudioPayload] = useState("");

  useEffect(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const h = typeof window !== 'undefined' ? window.innerHeight : 768;
    setWindowSize({ w, h });
    
    const centerX = snapToGrid(w / 2 - 16, 0);
    const startY = snapToGrid(h * 0.4 + HEADER_OFFSET, HEADER_OFFSET);
    
    setCanvasItems([
      { instanceId: 'entry_origin', name: 'Entry Point', icon: 'Shield', x: centerX, y: startY, isRegistered: true, isOrigin: true }
    ]);
    
    const vx = - (centerX - (w / 2) + 16);
    const vy = - (startY - (h / 2) + 16);
    setViewOffset({ x: vx, y: vy });
    
    setIsReady(true);
    const handleResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const deleteConnection = (id: string) => {
    setConnections(prev => prev.filter(c => c.id !== id));
  };

  const gatherLayout = (mode: 'grid' | 'tether') => {
    setLayoutMode(mode);
    setIsTransitioning(true);
    setCanvasItems(prev => {
        const newItems = prev.map(item => ({ ...item }));
        const visited = new Set<string>();
        const occupied = new Set<string>();
        const getPosKey = (x: number, y: number) => `${Math.round(x)},${Math.round(y)}`;

        const findSafePosition = (startX: number, startY: number, stepX: number, stepY: number) => {
            let tx = startX, ty = startY;
            let safety = 0;
            while (occupied.has(getPosKey(tx, ty)) && safety < 1000) {
                tx += stepX; ty += stepY; safety++;
            }
            return { tx, ty };
        };

        const connIds = new Set([
            ...connections.map(c => c.sourceId),
            ...connections.map(c => c.targetId)
        ]);

        const standalone = newItems.filter(i => !connIds.has(i.instanceId) && !i.isTrigger && !i.isOrigin);
        const inFlow = newItems.filter(i => connIds.has(i.instanceId) || i.isTrigger || i.isOrigin);
        const incomingTargetIds = new Set(connections.map(c => c.targetId));
        const roots = inFlow.filter(i => !incomingTargetIds.has(i.instanceId));

        let sx = 64, sy = 120;
        standalone.forEach((item, idx) => {
          item.x = snapToGrid(sx + (idx % 8) * GRID_SIZE, 0);
          item.y = snapToGrid(sy + Math.floor(idx / 8) * GRID_SIZE, HEADER_OFFSET);
          occupied.add(getPosKey(item.x, item.y));
          visited.add(item.instanceId);
        });

        let currentFlowX = snapToGrid(windowSize.w / 2 - 16, 0);
        const startY = snapToGrid(windowSize.h * 0.4, HEADER_OFFSET);
        const sortedRoots = [...roots].sort((a, b) => (a.isOrigin ? -1 : (b.isOrigin ? 1 : 0)));

        sortedRoots.forEach((root) => {
            let maxNodeX = currentFlowX;
            const processNode = (nodeId: string, cx: number, cy: number) => {
                visited.add(nodeId); occupied.add(getPosKey(cx, cy));
                maxNodeX = Math.max(maxNodeX, cx);
                const node = newItems.find(i => i.instanceId === nodeId);
                if (node) { node.x = cx; node.y = cy; }
                const outgoing = connections.filter(c => c.sourceId === nodeId);
                outgoing.forEach(conn => {
                    if (visited.has(conn.targetId)) return;
                    const step = mode === 'grid' ? GRID_SIZE : GRID_SIZE * 1.5;
                    let tx = cx, ty = cy;
                    if (conn.sourceSide === 'bottom') ty += step * 2;
                    else if (conn.sourceSide === 'right') tx += step * 2;
                    else if (conn.sourceSide === 'left') tx -= step * 2;
                    else if (conn.sourceSide === 'top') ty -= step * 2;
                    const { tx: finalX, ty: finalY } = findSafePosition(snapToGrid(tx, 0), snapToGrid(ty, HEADER_OFFSET), 0, GRID_SIZE);
                    processNode(conn.targetId, finalX, finalY);
                });
            };
            processNode(root.instanceId, currentFlowX, startY);
            currentFlowX = snapToGrid(maxNodeX + GRID_SIZE * 3, 0);
        });

        const origin = newItems.find(i => i.isOrigin) || sortedRoots[0] || standalone[0];
        if (origin) {
            const targetVX = windowSize.w / 2 - (origin.x + 16) * zoom;
            const targetVY = windowSize.h / 2 - (origin.y - HEADER_OFFSET + 16) * zoom;
            setViewOffset({ x: targetVX, y: targetVY });
        }
        return newItems;
    });
    setTimeout(() => setIsTransitioning(false), 600);
  };

  const handleSmartBirth = (item: Partial<FolderItem>) => {
    const screenCenterX = (windowSize.w / 2 - viewOffset.x) / zoom;
    const screenCenterY = (windowSize.h / 2 - viewOffset.y) / zoom;
    let spawnX = snapToGrid(screenCenterX - 16, 0);
    let spawnY = snapToGrid(screenCenterY - 16, HEADER_OFFSET);
    const newInstanceId = `inst_${Date.now()}`;
    const newItem = { ...item, instanceId: newInstanceId, x: spawnX, y: spawnY, isRegistered: !item.isBuilder } as CanvasItem;
    setCanvasItems(prev => [...prev, newItem]);
    setActiveFolderView(null);
  };

  const handleCanvasPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
    const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
    setIsPanning(true); panStart.current = { x: clientX, y: clientY }; panOffsetStart.current = { ...viewOffset };
  };

  const handleItemPointerDown = (e: React.MouseEvent | React.TouchEvent, item: CanvasItem) => {
    e.stopPropagation(); 
    const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
    const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
    setDragStartPos({ id: item.instanceId, x: clientX, y: clientY });
    mouseOffset.current = { x: (clientX - viewOffset.x) / zoom - item.x, y: (clientY - viewOffset.y) / zoom - item.y };
    pressTimer.current = setTimeout(() => { setIsDragging(true); setDraggingId(item.instanceId); }, LONG_PRESS_MS);
  };

  const handleItemPointerUp = (item: CanvasItem) => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      if (!isDragging && !isPanning) {
        if (!item.isRegistered) {
           setEditingItem(item); setStudioName(item.name || ""); setStudioIcon(item.icon || "Terminal");
           setStudioPayload(""); setIsStudioOpen(true);
        }
      }
    }
  };

  const handleZoomIn = () => setZoom(prev => Math.min(2, prev + 0.1));
  const handleZoomOut = () => setZoom(prev => Math.max(0.5, prev - 0.1));

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'clientX' in e ? e.clientX : (e as TouchEvent).touches[0].clientX;
      const clientY = 'clientY' in e ? e.clientY : (e as TouchEvent).touches[0].clientY;
      if (dragStartPos && !isDragging) {
          const dist = Math.sqrt(Math.pow(clientX - dragStartPos.x, 2) + Math.pow(clientX - dragStartPos.y, 2));
          if (dist > DRAG_THRESHOLD) { setIsDragging(true); setDraggingId(dragStartPos.id); if (pressTimer.current) clearTimeout(pressTimer.current); }
      }
      if (!isDragging && !isPanning) return;
      if (isPanning) {
        const dx = clientX - panStart.current.x; const dy = clientY - panStart.current.y;
        setViewOffset({ x: panOffsetStart.current.x + dx, y: panOffsetStart.current.y + dy });
        return;
      }
      const x = (clientX - viewOffset.x) / zoom - mouseOffset.current.x; 
      const y = (clientY - viewOffset.y) / zoom - mouseOffset.current.y;
      setCanvasItems(prev => prev.map(i => i.instanceId === draggingId ? { ...i, x, y } : i));
      const ghosts = calculateGhostHandshakes(itemsRef.current, connRef.current, draggingId!, { x, y });
      const best = ghosts[0] as any;
      if (best && (activeTether || best.dotDistance < SNAP_TOLERANCE)) { setActiveTether({ ...best }); }
    };
    const handleUp = (e: MouseEvent | TouchEvent) => {
      setDragStartPos(null); if (pressTimer.current) clearTimeout(pressTimer.current);
      if (isPanning) { setViewOffset(prev => ({ x: snapToGrid(prev.x, 0), y: snapToGrid(prev.y, 0) })); setIsPanning(false); return; }
      if (!isDragging) return; 
      setCanvasItems(prev => prev.map(i => i.instanceId === draggingId ? { ...i, x: snapToGrid(i.x, 0), y: snapToGrid(i.y, HEADER_OFFSET) } : i));
      if (activeTether) { setConnections(prev => prev.some(c => c.sourceId === activeTether.sourceId && c.sourceSide === activeTether.sourceSide && c.targetId === activeTether.targetId && c.targetSide === activeTether.targetSide) ? prev : [...prev, { ...activeTether, id: `conn_${Date.now()}` }]); }
      setActiveTether(null); setIsDragging(false); setDraggingId(null);
    };
    window.addEventListener('mousemove', handleMove); window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove); window.addEventListener('touchend', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); window.removeEventListener('touchmove', handleMove); window.removeEventListener('touchend', handleUp); };
  }, [isDragging, isPanning, draggingId, activeTether, dragStartPos, viewOffset, zoom]);

  // --- INTERNAL COMPACT FOLDER VIEW ---
  const CompactFolderView = ({ data, side, isOpen, onClose }: { data: FolderData, side: 'left' | 'right', isOpen: boolean, onClose: () => void }) => {
    const [path, setPath] = useState<FolderItem[]>([]);
    if (!isOpen) return null;
    const currentItems = path.length > 0 ? path[path.length - 1].items || [] : data.items;
    const currentTitle = path.length > 0 ? path[path.length - 1].name : data.title;

    return (
      <div className={`fixed bottom-[68px] ${side === 'left' ? 'left-[28px]' : 'right-[28px]'} z-[600] w-64 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in slide-in-from-bottom-2 duration-200`}>
        <div className={`${data.color} p-3 text-white flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            {path.length > 0 && <button onClick={() => setPath(p => p.slice(0, -1))} className="hover:bg-white/10 p-1 rounded-full"><ChevronLeft size={14}/></button>}
            <SafeIcon name={path.length > 0 ? (path[path.length-1].icon || 'Folder') : data.icon} size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">{currentTitle}</span>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 p-1 rounded-full"><X size={14}/></button>
        </div>
        <div className="p-3 bg-slate-50 grid grid-cols-3 gap-3">
          {currentItems.map((item, i) => (
            <div key={i} onClick={() => item.isFolder ? setPath(p => [...p, item]) : (item.id ? setCurrentPageId(item.id) : handleSmartBirth(item))} className="flex flex-col items-center gap-1 cursor-pointer group">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${item.isFolder ? 'bg-slate-100 border-slate-200 text-slate-400' : 'bg-white border-slate-100 text-slate-400 group-hover:bg-blue-600 group-hover:text-white shadow-sm'}`}>
                <SafeIcon name={item.icon || (item.isFolder ? 'Folder' : 'Zap')} size={16} />
              </div>
              <span className="text-[8px] font-bold uppercase text-slate-400 group-hover:text-slate-900 truncate w-full text-center">{item.name}</span>
            </div>
          ))}
          {currentItems.length === 0 && <div className="col-span-3 text-center py-4 text-[8px] text-slate-300 font-bold uppercase italic">Empty</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-full h-screen bg-white overflow-hidden select-none font-sans">
      <main className="absolute inset-0 overflow-hidden">
        <div className="w-full h-full relative overflow-hidden bg-white" onMouseDown={handleCanvasPointerDown} onTouchStart={handleCanvasPointerDown} onContextMenu={(e) => e.preventDefault()} style={{ touchAction: 'none' }}>
          <div className="absolute inset-0 pointer-events-none opacity-100" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, #E2E8F0 2.5px, transparent 0)`, backgroundSize: `${32 * zoom}px ${32 * zoom}px`, backgroundPosition: `${(viewOffset.x + 16 * zoom) % (32 * zoom)}px ${(viewOffset.y + 16 * zoom) % (32 * zoom)}px` }} />
          <div style={{ transform: `translate(${viewOffset.x}px, ${viewOffset.y}px) scale(${zoom})`, transformOrigin: '0 0' }} className={`w-full h-full relative ${isTransitioning ? 'transition-transform duration-500 ease-in-out' : ''}`}>
              {currentPageId === 'studio' ? (
                <>
                  <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0 overflow-visible">
                      {connections.map(conn => {
                          const s = canvasItems.find(i => i.instanceId === conn.sourceId), t = canvasItems.find(i => i.instanceId === conn.targetId);
                          if(!s || !t) return null;
                          const sX = s.x + (conn.sourceSide === 'right' ? 32 : (conn.sourceSide === 'left' ? 0 : 16)), sY = s.y - HEADER_OFFSET + (conn.sourceSide === 'bottom' ? 32 : (conn.sourceSide === 'top' ? 0 : 16));
                          const tX = t.x + (conn.targetSide === 'right' ? 32 : (conn.targetSide === 'left' ? 0 : 16)), tY = t.y - HEADER_OFFSET + (conn.targetSide === 'bottom' ? 32 : (conn.targetSide === 'top' ? 0 : 16));
                          const pathData = getSmartPath(sX, sY, tX, tY, conn.sourceSide, conn.targetSide, conn.sourceId, conn.targetId, canvasItems, connections);
                          let strokeColor = conn.color.includes('emerald') ? '#10B981' : (conn.color.includes('rose') ? '#F43F5E' : (conn.color.includes('amber') ? '#FBBF24' : (conn.color.includes('fuchsia') ? '#D946EF' : '#3B82F6')));
                          return (
                            <React.Fragment key={conn.id}>
                              <path d={pathData.d} stroke={strokeColor} strokeWidth={3 / zoom} fill="none" strokeLinecap="round" />
                              <circle cx={pathData.mid.x} cy={pathData.mid.y} r={8 / zoom} fill="white" stroke={strokeColor} strokeWidth={2 / zoom} className="pointer-events-auto cursor-pointer hover:scale-125 transition-transform shadow-sm" onClick={(e) => { e.stopPropagation(); deleteConnection(conn.id); }} />
                            </React.Fragment>
                          );
                      })}
                      {activeTether && (() => {
                          const s = canvasItems.find(i => i.instanceId === activeTether.sourceId), t = canvasItems.find(i => i.instanceId === activeTether.targetId);
                          if(!s || !t) return null;
                          const sX = s.x + (activeTether.sourceSide === 'right' ? 32 : (activeTether.sourceSide === 'left' ? 0 : 16)), sY = s.y - HEADER_OFFSET + (activeTether.sourceSide === 'bottom' ? 32 : (activeTether.sourceSide === 'top' ? 0 : 16));
                          const tX = t.x + (activeTether.targetSide === 'right' ? 32 : (activeTether.targetSide === 'left' ? 0 : 16)), tY = t.y - HEADER_OFFSET + (activeTether.targetSide === 'bottom' ? 32 : (activeTether.targetSide === 'top' ? 0 : 16));
                          const pathData = getSmartPath(sX, sY, tX, tY, activeTether.sourceSide, activeTether.targetSide, activeTether.sourceId, activeTether.targetId, canvasItems, connections);
                          let strokeColor = activeTether.color.includes('emerald') ? '#10B981' : (activeTether.color.includes('rose') ? '#F43F5E' : (activeTether.color.includes('amber') ? '#FBBF24' : (activeTether.color.includes('fuchsia') ? '#D946EF' : '#3B82F6')));
                          return <path d={pathData.d} stroke={strokeColor} strokeWidth={3 / zoom} fill="none" strokeDasharray={`${6/zoom},${4/zoom}`} className="opacity-50" />;
                      })()}
                  </svg>
                  {canvasItems.map(item => (
                    <div key={item.instanceId} onMouseDown={(e) => handleItemPointerDown(e, item)} onMouseUp={() => handleItemPointerUp(item)} onTouchStart={(e) => handleItemPointerDown(e, item)} onTouchEnd={() => handleItemPointerUp(item)} className={`absolute cursor-pointer flex items-center justify-center ${isDragging && draggingId === item.instanceId ? 'z-[1000]' : ''}`} style={{ left: item.x, top: item.y - HEADER_OFFSET, width: 32, height: 32 }}>
                      <div className={`w-[30px] h-[30px] ${(item.isOrigin || item.isTrigger) ? 'bg-slate-900' : 'bg-white'} rounded-md shadow-sm flex items-center justify-center border relative ${(item.isOrigin || item.isTrigger) ? 'border-slate-800' : (item.isRegistered ? 'border-slate-200' : 'border-emerald-300')}`}>
                        {(item.isOrigin || item.isTrigger) ? <Shield size={16} className="text-white" /> : <SafeIcon name={item.icon} size={16} className={item.isRegistered ? 'text-slate-800' : 'text-emerald-500'} />}
                        {LATCH_POINTS.map(lp => {
                          const { dotColor, isActive } = getPortState(item, lp, connections, activeTether);
                          return <div key={lp.id} className={`absolute rounded-full border border-white shadow-sm transition-all duration-300 ${dotColor} ${isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`} style={{ left: `${lp.x * 100}%`, top: `${lp.y * 100}%`, transform: 'translate(-50%, -50%)', width: 8 / zoom, height: 8 / zoom }} />;
                        })}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="p-12 max-w-5xl"><h1 className="text-4xl font-black italic uppercase text-slate-800 mb-8">Dashboard</h1><div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm w-64 h-32 flex flex-col justify-center"><p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total Nodes</p><p className="text-4xl font-black text-slate-800">{canvasItems.length}</p></div></div>
              )}
          </div>
        </div>
      </main>
      <div onClick={() => gatherLayout('grid')} className="fixed top-[28px] right-[28px] z-[1000] w-[32px] h-[32px] bg-white flex items-center justify-center cursor-pointer border border-slate-200 rounded-md shadow-sm hover:bg-slate-50 transition-all"><LayoutGrid size={20} className="text-slate-600" /></div>
      <div onClick={() => gatherLayout('tether')} className="fixed top-[60px] right-[28px] z-[1000] w-[32px] h-[32px] bg-white flex items-center justify-center cursor-pointer border border-slate-200 rounded-md shadow-sm hover:bg-slate-50 transition-all"><Waypoints size={20} className="text-slate-600" /></div>
      <div onClick={handleZoomIn} className="fixed top-[calc(50vh-32px)] right-[28px] z-[1000] w-[32px] h-[32px] bg-white flex items-center justify-center cursor-pointer border border-slate-200 rounded-md shadow-sm hover:bg-slate-50 transition-all"><Plus size={20} className="text-slate-700" /></div>
      <div onClick={handleZoomOut} className="fixed top-[50vh] right-[28px] z-[1000] w-[32px] h-[32px] bg-white flex items-center justify-center cursor-pointer border border-slate-200 rounded-md shadow-sm hover:bg-slate-50 transition-all"><Minus size={20} className="text-slate-700" /></div>
      
      <div onClick={() => setActiveFolderView(v => v === 'toolbox' ? null : 'toolbox')} className="fixed bottom-[28px] left-[28px] z-[700] w-[32px] h-[32px] bg-slate-900 rounded-md shadow-md flex items-center justify-center cursor-pointer hover:scale-105 transition-transform border border-slate-800"><Folder size={20} className="text-white" /></div>
      <div onClick={() => setActiveFolderView(v => v === 'nav' ? null : 'nav')} className="fixed bottom-[28px] right-[28px] z-[700] w-[32px] h-[32px] bg-blue-600 rounded-md shadow-md flex items-center justify-center cursor-pointer hover:scale-105 transition-transform border border-blue-700"><Compass size={20} className="text-white" /></div>
      
      <CompactFolderView data={toolboxData} side="left" isOpen={activeFolderView === 'toolbox'} onClose={() => setActiveFolderView(null)} />
      <CompactFolderView data={navData} side="right" isOpen={activeFolderView === 'nav'} onClose={() => setActiveFolderView(null)} />

      {isStudioOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 space-y-6">
            <h2 className="text-3xl font-black italic uppercase text-slate-800 text-center">Action Init</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <input value={studioName} onChange={e => setStudioName(e.target.value)} placeholder="Identity..." className="w-full bg-slate-50 p-4 rounded-xl font-bold border outline-none" />
              <textarea value={studioPayload} onChange={e => setStudioPayload(e.target.value)} className="w-full h-28 bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-[10px] resize-none border border-white/10 outline-none" placeholder="Payload Schema" />
            </div>
            <div className="flex gap-4">
              <button onClick={() => setIsStudioOpen(false)} className="flex-1 py-5 bg-slate-100 text-slate-400 font-black uppercase text-xs rounded-3xl">Cancel</button>
              <button onClick={() => { if (!editingItem) return; setCanvasItems(prev => prev.map(i => i.instanceId === editingItem.instanceId ? { ...i, name: studioName, icon: studioIcon, payload: studioPayload, isRegistered: true } : i)); setIsStudioOpen(false); setEditingItem(null); }} className="flex-1 py-5 bg-slate-900 text-white font-black uppercase text-xs rounded-3xl">Initialize</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
