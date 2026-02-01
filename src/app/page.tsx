
"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Trash2, X, LayoutGrid, Waypoints, LayoutTemplate, Home, Folder, Plus, Settings, Compass, Zap, Package, Radio, Code2, Terminal } from 'lucide-react';
import { SafeIcon } from '@/components/SafeIcon';
import { AndroidFolder } from '@/components/AndroidFolder';
import { 
  CanvasItem, Connection, FolderData, FolderItem 
} from '@/lib/types';
import { 
  HEADER_OFFSET, SNAP_TOLERANCE, DETECTION_RANGE, TETHER_DELAY, 
  DRAG_THRESHOLD, LONG_PRESS_MS, SELECTABLE_ICONS, LATCH_POINTS 
} from '@/lib/constants';
import { getSmartPath, snapToGrid } from '@/lib/pathing';

export default function App() {
  // --- STATE ---
  const [currentPageId, setCurrentPageId] = useState('studio');
  const [activeFolderView, setActiveFolderView] = useState<'nav' | 'toolbox' | null>(null);
  const [windowSize, setWindowSize] = useState({ w: 1024, h: 768 });
  const [isReady, setIsReady] = useState(false);
  
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([
    { instanceId: 'entry_origin', name: 'Entry Point', icon: 'Shield', x: 0, y: 128 + HEADER_OFFSET, isRegistered: true, isOrigin: true }
  ]);
  const [connections, setConnections] = useState<Connection[]>([]); 
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  
  const [isDragging, setIsDragging] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null); 
  const [isPanning, setIsPanning] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{id: string, x: number, y: number} | null>(null); 

  const [activeTether, setActiveTether] = useState<Connection | null>(null); 
  const tetherTimer = useRef<NodeJS.Timeout | null>(null);

  const toolboxData: FolderData = {
    id: 'toolbox',
    title: 'Toolbox',
    icon: 'Package',
    color: 'bg-slate-900',
    items: [
      { name: 'New Action', icon: 'Plus', isBuilder: true },
      { name: 'Actions', icon: 'Zap', isFolder: true, items: [] },
      { name: 'Triggers', icon: 'Radio', isFolder: true, items: [] },
      { name: 'Logic', icon: 'Code2', isFolder: true, items: [] }
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

  const lastTap = useRef(0);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const mouseOffset = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const panOffsetStart = useRef({ x: 0, y: 0 });
  const lastValidPos = useRef({ x: 128, y: 128 + HEADER_OFFSET });

  const [editingItem, setEditingItem] = useState<CanvasItem | null>(null);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [studioName, setStudioName] = useState("");
  const [studioIcon, setStudioIcon] = useState("Terminal");
  const [studioPayload, setStudioPayload] = useState("");

  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    setWindowSize({ w, h });
    const centerX = snapToGrid(w / 2 - 16, 0);
    setCanvasItems(prev => prev.map(item => item.isOrigin ? { ...item, x: centerX } : item));
    lastValidPos.current = { x: centerX, y: 128 + HEADER_OFFSET };
    setTimeout(() => setIsReady(true), 50);
    const handleResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const deleteConnection = (id: string) => {
    setConnections(prev => prev.filter(c => c.id !== id));
  };

  const gatherLayout = (mode: 'grid' | 'tether') => {
    setCanvasItems(prev => {
      const newItems = prev.map(item => ({ ...item }));
      const origin = newItems.find(i => i.isOrigin);
      if (!origin) return prev;
      const visited = new Set<string>();
      const occupied = new Set<string>();
      const step = 32;
      const minGap = mode === 'tether' ? 32 : 0;
      
      const isPositionOccupied = (x: number, y: number) => {
        const threshold = minGap + 1;
        for (const pos of occupied) {
          const [ox, oy] = pos.split(',').map(Number);
          if (Math.abs(ox - x) < threshold && Math.abs(oy - y) < threshold) return true;
        }
        return false;
      };

      visited.add(origin.instanceId);
      occupied.add(`${origin.x},${origin.y}`);
      
      const processNode = (nodeId: string, cx: number, cy: number) => {
        const children = connections.filter(c => c.sourceId === nodeId);
        children.forEach(conn => {
          if (visited.has(conn.targetId)) return;
          let found = false, safety = 0, searchDist = step + minGap, tx = cx, ty = cy;
          while (!found && safety < 15) {
            let nextX = cx, nextY = cy;
            if (conn.sourceSide === 'bottom') nextY += searchDist;
            else if (conn.sourceSide === 'right') nextX += searchDist;
            else if (conn.sourceSide === 'left') nextX -= searchDist;
            else if (conn.sourceSide === 'top') nextY -= searchDist;
            
            if (!isPositionOccupied(nextX, nextY)) { tx = nextX; ty = nextY; found = true; } else { searchDist += 32; }
            safety++;
          }
          const target = newItems.find(i => i.instanceId === conn.targetId);
          if (target) { target.x = tx; target.y = ty; visited.add(target.instanceId); occupied.add(`${tx},${ty}`); processNode(target.instanceId, tx, ty); }
        });
      };
      
      processNode(origin.instanceId, origin.x, origin.y);

      newItems.forEach(item => {
        if (!visited.has(item.instanceId)) {
          const outgoing = connections.find(c => c.sourceId === item.instanceId && visited.has(c.targetId));
          if (outgoing) {
            const target = newItems.find(i => i.instanceId === outgoing.targetId);
            if (target) {
              item.x = target.x;
              const verticalOffset = outgoing.color.includes('fuchsia') ? 64 : (32 + minGap);
              let finalY = target.y - verticalOffset, safety = 0;
              while (isPositionOccupied(item.x, finalY) && safety < 10) { finalY -= 32; safety++; }
              item.y = finalY; visited.add(item.instanceId); occupied.add(`${item.x},${item.y}`);
            }
          }
        }
      });
      return newItems;
    });
  };

  const isAncestor = (ancId: string, descId: string): boolean => {
    let curr = descId; const visited = new Set<string>();
    while (curr) {
      if (curr === ancId) return true; if (visited.has(curr)) break; visited.add(curr);
      const incoming = connRef.current.find(c => c.targetId === curr && !c.color.includes('fuchsia'));
      if (!incoming) break; curr = incoming.sourceId;
    }
    return false;
  };

  const getTreeId = (id: string): string | null => {
    let curr = id; const visited = new Set<string>(); let safety = 0;
    while (curr && safety < 100) {
      if (visited.has(curr)) return null; visited.add(curr);
      const node = itemsRef.current.find(i => i.instanceId === curr); if (!node) return null;
      if (node.isOrigin) return 'MAIN';
      const incoming = connRef.current.find(c => c.targetId === curr && !c.color.includes('fuchsia'));
      if (!incoming) return null;
      curr = incoming.sourceId; safety++;
    }
    return null;
  };

  const mainNodes = useMemo(() => {
    const main = new Set<string>(); const origin = canvasItems.find(i => i.isOrigin); if (!origin) return main;
    const queue = [origin.instanceId]; main.add(origin.instanceId); let safety = 0;
    while(queue.length > 0 && safety < 1000) {
      const currId = queue.shift()!;
      const outgoing = connections.filter(c => c.sourceId === currId && (c.sourceSide === 'bottom' || c.sourceSide === 'right') && !c.color.includes('fuchsia'));
      outgoing.forEach(conn => { if (!main.has(conn.targetId)) { main.add(conn.targetId); queue.push(conn.targetId); } });
      safety++;
    }
    return main;
  }, [canvasItems, connections]);

  const calculateGhostHandshakes = (items: CanvasItem[], dId: string, dPos: {x: number, y: number} | null = null) => {
    if (activeTether) return []; const ghosts: Connection[] = [];
    const dragNode = dPos ? { ...items.find(i => i.instanceId === dId), ...dPos } : items.find(i => i.instanceId === dId);
    if (!dragNode) return ghosts;
    const dragTreeId = getTreeId(dId);
    
    items.forEach(other => {
      if (other.instanceId === dId) return;
      const otherTreeId = getTreeId(other.instanceId); const dx = (dragNode.x || 0) - other.x;
      const dy = (dragNode.y || 0) - other.y; const adx = Math.abs(dx); const ady = Math.abs(dy);
      const isSameTree = (dragTreeId !== null && otherTreeId !== null && dragTreeId === otherTreeId);
      const isUnattachedToCanvas = (otherTreeId !== null && dragTreeId === null);
      
      if (isSameTree || isUnattachedToCanvas) {
        const isBottomOccupied = connections.some(c => c.sourceId === other.instanceId && c.sourceSide === 'bottom');
        const isRightOccupied = connections.some(c => c.sourceId === other.instanceId && c.sourceSide === 'right');
        const isLeftOccupied = connections.some(c => c.sourceId === other.instanceId && c.sourceSide === 'left');

        if (dy > 0 && dy < DETECTION_RANGE && adx < SNAP_TOLERANCE && !isBottomOccupied) { ghosts.push({ id: 'ghost', sourceId: other.instanceId, sourceSide: 'bottom', targetId: dId, targetSide: 'top', color: 'bg-rose-500', displayColor: 'bg-rose-500', snapX: other.x, snapY: other.y + 32, dotDistance: Math.sqrt(adx**2 + (dy-32)**2) } as any); } 
        else if (dx > 0 && dx < DETECTION_RANGE && ady < SNAP_TOLERANCE && !isRightOccupied) { ghosts.push({ id: 'ghost', sourceId: other.instanceId, sourceSide: 'right', targetId: dId, targetSide: 'top', color: 'bg-emerald-500', displayColor: 'bg-emerald-500', snapX: other.x + 32, snapY: other.y, dotDistance: Math.sqrt((dx-32)**2 + ady**2) } as any); } 
        else if (dx < 0 && Math.abs(dx) < DETECTION_RANGE && ady < SNAP_TOLERANCE && !isLeftOccupied) { ghosts.push({ id: 'ghost', sourceId: other.instanceId, sourceSide: 'left', targetId: dId, targetSide: 'top', color: 'bg-fuchsia-500', displayColor: 'bg-fuchsia-500', snapX: other.x - 32, snapY: other.y, dotDistance: Math.sqrt((Math.abs(dx)-32)**2 + ady**2) } as any); }
      }
    });
    if (ghosts.length === 0) return []; ghosts.sort((a: any, b: any) => a.dotDistance - b.dotDistance); return [ghosts[0]];
  };

  const handleSmartBirth = (item: Partial<FolderItem>) => {
    const spawnX = -viewOffset.x + 32; const spawnY = -viewOffset.y + 32 + HEADER_OFFSET;
    setCanvasItems(prev => [...prev, { ...item, instanceId: `inst_${Date.now()}`, x: spawnX, y: spawnY, isRegistered: !item.isBuilder } as CanvasItem]);
    setActiveFolderView(null);
  };

  const handleCanvasPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
      const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
      setIsPanning(true); panStart.current = { x: clientX, y: clientY }; panOffsetStart.current = { ...viewOffset };
    }
    lastTap.current = now;
  };

  const handleItemPointerDown = (e: React.MouseEvent | React.TouchEvent, item: CanvasItem) => {
    e.stopPropagation(); const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
    const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
    setDragStartPos({ id: item.instanceId, x: clientX, y: clientY });
    mouseOffset.current = { x: clientX - item.x, y: clientY - item.y };
    lastValidPos.current = { x: item.x, y: item.y };
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

  const handleFolderSelect = (item: FolderItem) => {
    if (item.id) { setCurrentPageId(item.id); setActiveFolderView(null); } 
    else { handleSmartBirth(item); setActiveFolderView(null); }
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
      const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
      if (dragStartPos && !isDragging) {
          const dist = Math.sqrt(Math.pow(clientX - dragStartPos.x, 2) + Math.pow(clientY - dragStartPos.y, 2));
          if (dist > DRAG_THRESHOLD) { setIsDragging(true); setDraggingId(dragStartPos.id); if (pressTimer.current) clearTimeout(pressTimer.current); }
      }
      if (!isDragging && !isPanning) return;
      if (isPanning) {
        const dx = clientX - panStart.current.x;
        const dy = clientY - panStart.current.y;
        const finalX = currentPageId === 'home' ? panOffsetStart.current.x : panOffsetStart.current.x + dx;
        setViewOffset({ x: finalX, y: panOffsetStart.current.y + dy });
        return;
      }
      const x = clientX - mouseOffset.current.x; const y = clientY - mouseOffset.current.y;
      setCanvasItems(prev => prev.map(i => i.instanceId === draggingId ? { ...i, x, y } : i));
      const ghosts = calculateGhostHandshakes(itemsRef.current, draggingId!, { x, y });
      if (!activeTether) {
          const best = ghosts[0] as any;
          if (best && best.dotDistance < SNAP_TOLERANCE) {
              if (!tetherTimer.current) {
                  tetherTimer.current = setTimeout(() => { if(best) { setActiveTether({ ...best }); } }, TETHER_DELAY);
              }
          } else { if (tetherTimer.current) { clearTimeout(tetherTimer.current); tetherTimer.current = null; } }
      } 
    };
    const handleUp = (e: MouseEvent | TouchEvent) => {
      setDragStartPos(null); if (pressTimer.current) clearTimeout(pressTimer.current);
      if (isPanning) { setViewOffset(prev => ({ x: snapToGrid(prev.x, 0), y: snapToGrid(prev.y, 0) })); setIsPanning(false); return; }
      if (tetherTimer.current) { clearTimeout(tetherTimer.current); tetherTimer.current = null; }
      if (!isDragging) return; 
      setCanvasItems(prev => {
        const item = prev.find(i => i.instanceId === draggingId); if (!item) return prev;
        let finalX = snapToGrid(item.x, 0); let finalY = snapToGrid(item.y, HEADER_OFFSET);
        const ghosts = calculateGhostHandshakes(itemsRef.current, draggingId!, { x: item.x, y: item.y });
        const best = ghosts[0] as any;
        if (best && best.dotDistance < SNAP_TOLERANCE) { finalX = best.snapX!; finalY = best.snapY!; }
        return prev.map(i => i.instanceId === draggingId ? { ...i, x: finalX, y: finalY } : i);
      });
      if (activeTether) { setConnections(prev => [...prev, { ...activeTether, id: `conn_${Date.now()}` }]); } 
      setActiveTether(null); setIsDragging(false); setDraggingId(null);
    };
    window.addEventListener('mousemove', handleMove); window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove); window.addEventListener('touchend', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); window.removeEventListener('touchmove', handleMove); window.removeEventListener('touchend', handleUp); };
  }, [isDragging, isPanning, draggingId, activeTether, dragStartPos, viewOffset, currentPageId]); 

  return (
    <div className="relative w-full h-screen bg-[#F8FAFC] overflow-hidden select-none font-sans">
      <nav className="fixed top-0 left-0 right-0 h-14 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-8 z-[60]">
        <div className="flex items-center gap-4">
           <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white font-black shadow-lg"><SafeIcon name="Zap" size={16} fill="white"/></div>
           <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{currentPageId === 'home' ? 'Dashboard' : 'Logic Studio'}</span>
        </div>
      </nav>

      <main className="absolute inset-0 mt-14 overflow-hidden">
        <div className="w-full h-full relative overflow-hidden bg-slate-50" onMouseDown={handleCanvasPointerDown} onTouchStart={handleCanvasPointerDown} onContextMenu={(e) => e.preventDefault()} style={{ touchAction: 'none' }}>
          <div className="absolute inset-0 pointer-events-none opacity-100" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, #E2E8F0 2px, transparent 0)`, backgroundSize: `32px 32px`, backgroundPosition: `${(viewOffset.x + 16) % 32}px ${(viewOffset.y + 16) % 32}px` }} />

          {currentPageId === 'studio' && (
            <div className="fixed top-20 right-8 z-[100] flex flex-col gap-2">
              <div onClick={() => gatherLayout('grid')} className="w-8 h-8 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center justify-center cursor-pointer hover:bg-slate-50 active:scale-95 transition-all"><LayoutGrid size={16} className="text-slate-400" /></div>
              <div onClick={() => gatherLayout('tether')} className="w-8 h-8 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center justify-center cursor-pointer hover:bg-slate-50 active:scale-95 transition-all"><Waypoints size={16} className="text-slate-400" /></div>
            </div>
          )}

          <div style={{ transform: `translate(${viewOffset.x}px, ${viewOffset.y}px)` }} className="w-full h-full relative">
              {currentPageId === 'studio' ? (
                <>
                  <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0 overflow-visible">
                      {connections.map(conn => {
                          const s = canvasItems.find(i => i.instanceId === conn.sourceId), t = canvasItems.find(i => i.instanceId === conn.targetId);
                          if(!s || !t) return null;
                          const sX = s.x + (conn.sourceSide === 'right' ? 32 : (conn.sourceSide === 'left' ? 0 : 16)), sY = s.y - HEADER_OFFSET + (conn.sourceSide === 'bottom' ? 32 : (conn.sourceSide === 'top' ? 0 : 16));
                          const tX = t.x + (conn.targetSide === 'right' ? 32 : (conn.targetSide === 'left' ? 0 : 16)), tY = t.y - HEADER_OFFSET + (conn.targetSide === 'bottom' ? 32 : (conn.targetSide === 'top' ? 0 : 16));
                          const pathData = getSmartPath(sX, sY, tX, tY, conn.sourceSide, conn.targetSide, conn.sourceId, conn.targetId, canvasItems);
                          const c = conn.color.includes('rose') ? '#F43F5E' : conn.color.includes('emerald') ? '#10B981' : conn.color.includes('blue') ? '#3B82F6' : conn.color.includes('fuchsia') ? '#D946EF' : '#FBBF24';
                          return (
                            <React.Fragment key={conn.id}>
                              <path d={pathData.d} stroke={c} strokeWidth="3" fill="none" strokeLinecap="round" />
                              <circle 
                                cx={pathData.mid.x} cy={pathData.mid.y} r="10" 
                                fill="white" stroke={c} strokeWidth="2" 
                                className="pointer-events-auto cursor-pointer hover:scale-125 transition-transform" 
                                onClick={(e) => { e.stopPropagation(); deleteConnection(conn.id); }}
                              />
                              <X x={pathData.mid.x - 4} y={pathData.mid.y - 4} size={8} stroke={c} strokeWidth={3} className="pointer-events-none" />
                            </React.Fragment>
                          );
                      })}
                  </svg>
                  {canvasItems.map(item => (
                    <div key={item.instanceId} onMouseDown={(e) => handleItemPointerDown(e, item)} onMouseUp={() => handleItemPointerUp(item)} onTouchStart={(e) => handleItemPointerDown(e, item)} onTouchEnd={() => handleItemPointerUp(item)}
                      className={`absolute cursor-pointer flex items-center justify-center ${isDragging && draggingId === item.instanceId ? 'z-[1000]' : (isReady ? 'transition-all duration-300' : '')} z-10`} style={{ left: item.x, top: item.y - HEADER_OFFSET, width: 32, height: 32 }}>
                      <div className={`w-[30px] h-[30px] bg-white rounded-md shadow-sm flex items-center justify-center border relative ${item.isOrigin ? 'border-blue-400' : (item.isRegistered ? 'border-slate-200' : 'border-emerald-300')}`}>
                        <SafeIcon name={item.icon} size={16} className={item.isRegistered ? (mainNodes.has(item.instanceId) ? 'text-slate-800' : 'text-slate-400') : 'text-emerald-500'} />
                        
                        {/* Anchor Dots */}
                        {LATCH_POINTS.map(lp => {
                          const hasConn = connections.some(c => c.sourceId === item.instanceId && c.sourceSide === lp.id);
                          const dotColor = hasConn ? (lp.id === 'right' ? 'bg-emerald-500' : lp.id === 'bottom' ? 'bg-rose-500' : lp.id === 'left' ? 'bg-fuchsia-500' : 'bg-blue-500') : 'bg-slate-200';
                          return (
                            <div key={lp.id} className={`absolute w-2 h-2 rounded-full border border-white shadow-sm ${dotColor}`} style={{ left: `${lp.x * 100}%`, top: `${lp.y * 100}%`, transform: 'translate(-50%, -50%)' }} />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="p-12 max-w-5xl">
                   <h1 className="text-4xl font-black italic uppercase text-slate-800 mb-8">Dashboard</h1>
                   <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm w-64 h-32 flex flex-col justify-center">
                       <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total Active Nodes</p>
                       <p className="text-4xl font-black text-slate-800">{canvasItems.length}</p>
                   </div>
                </div>
              )}
          </div>
        </div>
      </main>

      <div className="fixed bottom-8 left-8 z-[500]">
        <div onClick={() => setActiveFolderView('toolbox')} className="w-8 h-8 bg-slate-900 rounded-lg shadow-xl flex items-center justify-center cursor-pointer hover:scale-110 transition-transform active:scale-95 border border-white/20"><Folder size={16} className="text-white" /></div>
      </div>
      <div className="fixed bottom-8 right-8 z-[500]">
        <div onClick={() => setActiveFolderView('nav')} className="w-8 h-8 bg-blue-600 rounded-lg shadow-xl flex items-center justify-center cursor-pointer hover:scale-110 transition-transform active:scale-95 border border-white/20"><SafeIcon name="Compass" size={16} className="text-white" /></div>
      </div>

      <AndroidFolder title={navData.title} icon={navData.icon} color={navData.color} items={navData.items} isOpen={activeFolderView === 'nav'} onClose={() => setActiveFolderView(null)} onSelect={handleFolderSelect} />
      <AndroidFolder title={toolboxData.title} icon={toolboxData.icon} color={toolboxData.color} items={toolboxData.items} isOpen={activeFolderView === 'toolbox'} onClose={() => setActiveFolderView(null)} onSelect={handleFolderSelect} />

      {isStudioOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 space-y-6">
            <h2 className="text-3xl font-black italic uppercase text-slate-800 text-center">Action Init</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <input value={studioName} onChange={e => setStudioName(e.target.value)} placeholder="Identity..." className="w-full bg-slate-50 p-4 rounded-xl font-bold border outline-none" />
                <div className="grid grid-cols-4 gap-2">
                    {SELECTABLE_ICONS.map(ic => (<button key={ic} onClick={() => setStudioIcon(ic)} className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${studioIcon === ic ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-400'}`}><SafeIcon name={ic} size={16} /></button>))}
                </div>
              </div>
              <textarea value={studioPayload} onChange={e => setStudioPayload(e.target.value)} className="w-full h-28 bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-[10px] resize-none border border-white/10 outline-none" placeholder="Payload Schema" />
            </div>
            <div className="flex gap-4">
              <button onClick={() => setIsStudioOpen(false)} className="flex-1 py-5 bg-slate-100 text-slate-400 font-black uppercase text-xs rounded-3xl">Cancel</button>
              <button onClick={() => {
                if (!editingItem) return;
                const dna = { name: studioName, icon: studioIcon, payload: studioPayload, isRegistered: true };
                setCanvasItems(prev => prev.map(i => i.instanceId === editingItem.instanceId ? { ...i, ...dna } : i));
                setIsStudioOpen(false); setEditingItem(null);
              }} className="flex-1 py-5 bg-slate-900 text-white font-black uppercase text-xs rounded-3xl">Initialize</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
