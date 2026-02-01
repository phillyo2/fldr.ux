
"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Trash2, X, LayoutGrid, Waypoints, Folder, Plus, Settings, Compass, Zap, Package, Radio, Code2, Terminal, ChevronRight, ChevronLeft } from 'lucide-react';
import { SafeIcon } from '@/components/SafeIcon';
import { AndroidFolder } from '@/components/AndroidFolder';
import { 
  CanvasItem, Connection, FolderData, FolderItem 
} from '@/lib/types';
import { 
  HEADER_OFFSET, SNAP_TOLERANCE, DETECTION_RANGE, TETHER_DELAY, 
  DRAG_THRESHOLD, LONG_PRESS_MS, SELECTABLE_ICONS, LATCH_POINTS, GRID_SIZE 
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
      { name: 'Logic', icon: 'Code2', isFolder: true, items: [
        { name: 'Circuit Breaker', icon: 'Shuffle', isBuilder: true }
      ] }
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

  // --- TREE LOGIC ---
  const getTreeContext = (nodeId: string, currentConnections: Connection[]): string | null => {
    const contexts = new Map<string, string>();
    const visited = new Set<string>();
    const queue: {id: string, context: string}[] = [{id: 'entry_origin', context: 'main'}];
    
    contexts.set('entry_origin', 'main');

    while(queue.length > 0) {
      const {id, context} = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      const outgoing = currentConnections.filter(c => c.sourceId === id && !c.color.includes('fuchsia'));
      for (const conn of outgoing) {
        // Yellow (Amber) creates a new isolated context
        const nextContext = conn.color.includes('amber') ? `sub_${conn.targetId}` : context;
        contexts.set(conn.targetId, nextContext);
        queue.push({id: conn.targetId, context: nextContext});
      }
    }
    return contexts.get(nodeId) || null;
  };

  const isNodeInTree = (nodeId: string): boolean => {
    return !!getTreeContext(nodeId, connRef.current);
  };

  const gatherLayout = (mode: 'grid' | 'tether') => {
    setCanvasItems(prev => {
      const newItems = prev.map(item => ({ ...item }));
      const origin = newItems.find(i => i.isOrigin);
      if (!origin) return prev;
      const visited = new Set<string>();
      const occupied = new Set<string>();
      const minGap = mode === 'tether' ? GRID_SIZE : 0;
      
      const isPositionOccupied = (x: number, y: number) => {
        const threshold = 1; 
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
          let found = false, safety = 0, searchDist = GRID_SIZE + minGap, tx = cx, ty = cy;
          
          if (conn.color.includes('fuchsia')) {
            // Isolated Inputs positioned above
          } else {
            while (!found && safety < 15) {
              let nextX = cx, nextY = cy;
              if (conn.sourceSide === 'bottom') nextY += searchDist;
              else if (conn.sourceSide === 'right') nextX += searchDist;
              else if (conn.sourceSide === 'left') nextX -= searchDist;
              else if (conn.sourceSide === 'top') nextY -= searchDist;
              
              if (!isPositionOccupied(nextX, nextY)) { tx = nextX; ty = nextY; found = true; } else { searchDist += GRID_SIZE; }
              safety++;
            }
            const target = newItems.find(i => i.instanceId === conn.targetId);
            if (target) { target.x = tx; target.y = ty; visited.add(target.instanceId); occupied.add(`${tx},${ty}`); processNode(target.instanceId, tx, ty); }
          }
        });

        // Position isolated inputs
        const inputs = connections.filter(c => c.targetId === nodeId && c.color.includes('fuchsia'));
        inputs.forEach(conn => {
          if (visited.has(conn.sourceId)) return;
          const tx = cx;
          const ty = cy - (GRID_SIZE * 2); 
          const source = newItems.find(i => i.instanceId === conn.sourceId);
          if (source) { source.x = tx; source.y = ty; visited.add(source.instanceId); occupied.add(`${tx},${ty}`); }
        });
      };
      
      processNode(origin.instanceId, origin.x, origin.y);
      return newItems;
    });
  };

  const calculateGhostHandshakes = (items: CanvasItem[], dId: string, dPos: {x: number, y: number} | null = null) => {
    const ghosts: Connection[] = [];
    const dragNode = dPos ? { ...items.find(i => i.instanceId === dId), ...dPos } : items.find(i => i.instanceId === dId);
    if (!dragNode) return ghosts;
    
    const dragCtx = getTreeContext(dId, connRef.current);

    items.forEach(other => {
      if (other.instanceId === dId) return;
      const otherCtx = getTreeContext(other.instanceId, connRef.current);
      
      const getPortPos = (item: any, side: string) => {
        if (side === 'top') return { x: item.x + 16, y: item.y };
        if (side === 'bottom') return { x: item.x + 16, y: item.y + 32 };
        if (side === 'right') return { x: item.x + 32, y: item.y + 16 };
        if (side === 'left') return { x: item.x, y: item.y + 16 };
        return { x: item.x + 16, y: item.y + 16 };
      };

      LATCH_POINTS.forEach(lSource => {
        // Source is Parent, Target is Child (Standard Top Input)
        const lTarget = LATCH_POINTS.find(p => p.id === 'top')!;

        // 1. Drag Node is Source (Ancestor) -> Other is Target (Descendant)
        const sPos = getPortPos(dragNode, lSource.id);
        const tPos = getPortPos(other, lTarget.id);
        const dist = Math.sqrt(Math.pow(sPos.x - tPos.x, 2) + Math.pow(sPos.y - tPos.y, 2));

        if (dist < DETECTION_RANGE) {
          let color = '';
          if (lSource.id === 'bottom') color = 'bg-emerald-500';
          else if (lSource.id === 'right') color = 'bg-rose-500';
          else if (lSource.id === 'left') color = 'bg-amber-400';
          else if (lSource.id === 'top') color = 'bg-blue-500';

          let valid = false;
          // Tree Expansion: Tree Source -> Floating Target
          if (dragCtx && !otherCtx) valid = true;
          // Recursion: Same Tree Context
          if (dragCtx && otherCtx && dragCtx === otherCtx) valid = true;

          if (valid) {
            ghosts.push({ id: 'ghost', sourceId: dId, sourceSide: lSource.id, targetId: other.instanceId, targetSide: lTarget.id, color, dotDistance: dist } as any);
          }
        }

        // 2. Other is Source (Ancestor) -> Drag Node is Target (Descendant)
        const sPosInv = getPortPos(other, lSource.id);
        const tPosInv = getPortPos(dragNode, lTarget.id);
        const distInv = Math.sqrt(Math.pow(sPosInv.x - tPosInv.x, 2) + Math.pow(sPosInv.y - tPosInv.y, 2));

        if (distInv < DETECTION_RANGE) {
          let color = '';
          if (lSource.id === 'bottom') color = 'bg-emerald-500';
          else if (lSource.id === 'right') color = 'bg-rose-500';
          else if (lSource.id === 'left') color = 'bg-amber-400';
          else if (lSource.id === 'top') color = 'bg-blue-500';

          let valid = false;
          // Tree Expansion: Tree Source -> Floating Target
          if (otherCtx && !dragCtx) valid = true;
          // Recursion: Same Tree Context
          if (dragCtx && otherCtx && dragCtx === otherCtx) valid = true;
          // Isolated Input: Floating Source -> Tree Top Input
          if (!otherCtx && dragCtx && lTarget.id === 'top') { color = 'bg-fuchsia-500'; valid = true; }

          if (valid) {
            ghosts.push({ id: 'ghost', sourceId: other.instanceId, sourceSide: lSource.id, targetId: dId, targetSide: lTarget.id, color, dotDistance: distInv } as any);
          }
        }
      });
    });

    return ghosts.sort((a: any, b: any) => a.dotDistance - b.dotDistance);
  };

  const handleSmartBirth = (item: Partial<FolderItem>) => {
    const spawnX = snapToGrid(-viewOffset.x + 32, 0);
    const spawnY = snapToGrid(-viewOffset.y + 32 + HEADER_OFFSET, HEADER_OFFSET);
    setCanvasItems(prev => [...prev, { ...item, instanceId: `inst_${Date.now()}`, x: spawnX, y: spawnY, isRegistered: !item.isBuilder } as CanvasItem]);
    setActiveFolderView(null);
  };

  const handleCanvasPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
      const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
      if (currentPageId !== 'home') {
        setIsPanning(true); panStart.current = { x: clientX, y: clientY }; panOffsetStart.current = { ...viewOffset };
      }
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
      const best = ghosts[0] as any;
      
      if (best && best.dotDistance < SNAP_TOLERANCE) {
          if (!tetherTimer.current && !activeTether) {
              tetherTimer.current = setTimeout(() => { if(best) { setActiveTether({ ...best }); } }, TETHER_DELAY);
          }
      } else { 
        if (tetherTimer.current) { clearTimeout(tetherTimer.current); tetherTimer.current = null; }
        if (activeTether) setActiveTether(null);
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
        
        if (activeTether) {
          const target = prev.find(i => i.instanceId === activeTether.targetId);
          const source = prev.find(i => i.instanceId === activeTether.sourceId);
          if (target && source) {
             if (draggingId === activeTether.sourceId) {
                if (activeTether.sourceSide === 'bottom' && activeTether.targetSide === 'top') { finalX = target.x; finalY = target.y - GRID_SIZE; }
                else if (activeTether.sourceSide === 'right' && activeTether.targetSide === 'left') { finalX = target.x - GRID_SIZE; finalY = target.y; }
                else if (activeTether.sourceSide === 'left' && activeTether.targetSide === 'right') { finalX = target.x + GRID_SIZE; finalY = target.y; }
                else if (activeTether.sourceSide === 'top' && activeTether.targetSide === 'bottom') { finalX = target.x; finalY = target.y + GRID_SIZE; }
             } else {
                if (activeTether.targetSide === 'top' && activeTether.sourceSide === 'bottom') { finalX = source.x; finalY = source.y + GRID_SIZE; }
                else if (activeTether.targetSide === 'left' && activeTether.sourceSide === 'right') { finalX = source.x + GRID_SIZE; finalY = source.y; }
                else if (activeTether.targetSide === 'right' && activeTether.sourceSide === 'left') { finalX = source.x - GRID_SIZE; finalY = source.y; }
                else if (activeTether.targetSide === 'bottom' && activeTether.sourceSide === 'top') { finalX = source.x; finalY = source.y - GRID_SIZE; }
             }
          }
        }
        return prev.map(i => i.instanceId === draggingId ? { ...i, x: finalX, y: finalY } : i);
      });
      if (activeTether) { 
        setConnections(prev => {
          const exists = prev.find(c => c.sourceId === activeTether.sourceId && c.sourceSide === activeTether.sourceSide && c.targetId === activeTether.targetId && c.targetSide === activeTether.targetSide);
          if (exists) return prev;
          return [...prev, { ...activeTether, id: `conn_${Date.now()}` }];
        }); 
      } 
      setActiveTether(null); setIsDragging(false); setDraggingId(null);
    };
    window.addEventListener('mousemove', handleMove); window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove); window.addEventListener('touchend', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); window.removeEventListener('touchmove', handleMove); window.removeEventListener('touchend', handleUp); };
  }, [isDragging, isPanning, draggingId, activeTether, dragStartPos, viewOffset, currentPageId]); 

  return (
    <div className="relative w-full h-screen bg-white overflow-hidden select-none font-sans">
      <main className="absolute inset-0 overflow-hidden">
        <div className="w-full h-full relative overflow-hidden bg-white" onMouseDown={handleCanvasPointerDown} onTouchStart={handleCanvasPointerDown} onContextMenu={(e) => e.preventDefault()} style={{ touchAction: 'none' }}>
          <div className="absolute inset-0 pointer-events-none opacity-100" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, #E2E8F0 2.5px, transparent 0)`, backgroundSize: `32px 32px`, backgroundPosition: `${(viewOffset.x + 16) % 32}px ${(viewOffset.y + 16) % 32}px` }} />

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
                          const c = conn.color.includes('emerald') ? '#10B981' : conn.color.includes('rose') ? '#F43F5E' : conn.color.includes('amber') ? '#FBBF24' : conn.color.includes('blue') ? '#3B82F6' : '#D946EF';
                          return (
                            <React.Fragment key={conn.id}>
                              <path d={pathData.d} stroke={c} strokeWidth="3" fill="none" strokeLinecap="round" />
                              <circle 
                                cx={pathData.mid.x} cy={pathData.mid.y} r="8" 
                                fill="white" stroke={c} strokeWidth="2" 
                                className="pointer-events-auto cursor-pointer hover:scale-125 transition-transform shadow-sm" 
                                onClick={(e) => { e.stopPropagation(); deleteConnection(conn.id); }}
                              />
                              <X x={pathData.mid.x - 3} y={pathData.mid.y - 3} size={6} stroke={c} strokeWidth={3} className="pointer-events-none" />
                            </React.Fragment>
                          );
                      })}
                      {activeTether && (() => {
                          const s = canvasItems.find(i => i.instanceId === activeTether.sourceId), t = canvasItems.find(i => i.instanceId === activeTether.targetId);
                          if(!s || !t) return null;
                          const sX = s.x + (activeTether.sourceSide === 'right' ? 32 : (activeTether.sourceSide === 'left' ? 0 : 16)), sY = s.y - HEADER_OFFSET + (activeTether.sourceSide === 'bottom' ? 32 : (activeTether.sourceSide === 'top' ? 0 : 16));
                          const tX = t.x + (activeTether.targetSide === 'right' ? 32 : (activeTether.targetSide === 'left' ? 0 : 16)), tY = t.y - HEADER_OFFSET + (activeTether.targetSide === 'bottom' ? 32 : (activeTether.targetSide === 'top' ? 0 : 16));
                          const pathData = getSmartPath(sX, sY, tX, tY, activeTether.sourceSide, activeTether.targetSide, activeTether.sourceId, activeTether.targetId, canvasItems);
                          const c = activeTether.color.includes('emerald') ? '#10B981' : activeTether.color.includes('rose') ? '#F43F5E' : activeTether.color.includes('amber') ? '#FBBF24' : activeTether.color.includes('blue') ? '#3B82F6' : '#D946EF';
                          return <path d={pathData.d} stroke={c} strokeWidth="3" fill="none" strokeDasharray="6,4" className="opacity-50" />;
                      })()}
                  </svg>
                  {canvasItems.map(item => {
                    const draggingNode = draggingId ? canvasItems.find(i => i.instanceId === draggingId) : null;
                    const isNearby = draggingNode ? Math.sqrt(Math.pow(item.x - draggingNode.x, 2) + Math.pow(item.y - draggingNode.y, 2)) < DETECTION_RANGE : false;

                    return (
                    <div key={item.instanceId} onMouseDown={(e) => handleItemPointerDown(e, item)} onMouseUp={() => handleItemPointerUp(item)} onTouchStart={(e) => handleItemPointerDown(e, item)} onTouchEnd={() => handleItemPointerUp(item)}
                      className={`absolute cursor-pointer flex items-center justify-center ${isDragging && draggingId === item.instanceId ? 'z-[1000]' : (isReady ? 'transition-all duration-300' : '')} z-10`} style={{ left: item.x, top: item.y - HEADER_OFFSET, width: 32, height: 32, transition: isDragging && draggingId === item.instanceId ? 'none' : '' }}>
                      {item.name === 'Circuit Breaker' && <div className="absolute inset-0 translate-x-1 translate-y-1 bg-slate-200 rounded-md -z-10 shadow-md" />}
                      <div className={`w-[30px] h-[30px] bg-white rounded-md shadow-sm flex items-center justify-center border relative ${item.isOrigin ? 'border-blue-400' : (item.isRegistered ? 'border-slate-200' : 'border-emerald-300')}`}>
                        <SafeIcon name={item.icon} size={16} className={item.isRegistered ? 'text-slate-800' : 'text-emerald-500'} />
                        
                        {LATCH_POINTS.map(lp => {
                          const connected = connections.find(c => (c.sourceId === item.instanceId && c.sourceSide === lp.id) || (c.targetId === item.instanceId && c.targetSide === lp.id));
                          const tethered = activeTether && ((activeTether.sourceId === item.instanceId && activeTether.sourceSide === lp.id) || (activeTether.targetId === item.instanceId && activeTether.targetSide === lp.id));
                          
                          let dotColor = 'bg-slate-200';
                          let glowClass = '';
                          let opacityClass = 'opacity-0 scale-50';

                          if (connected) {
                            opacityClass = 'opacity-100 scale-100';
                            if (lp.id === 'bottom') { dotColor = 'bg-emerald-500'; glowClass = 'shadow-[0_0_10px_rgba(16,185,129,0.8)]'; }
                            else if (lp.id === 'right') { dotColor = 'bg-rose-500'; glowClass = 'shadow-[0_0_10px_rgba(244,63,94,0.8)]'; }
                            else if (lp.id === 'left') { dotColor = 'bg-amber-400'; glowClass = 'shadow-[0_0_10px_rgba(251,191,36,0.8)]'; }
                            else { 
                              const isFuchsia = connections.some(c => c.targetId === item.instanceId && c.targetSide === 'top' && c.color.includes('fuchsia'));
                              dotColor = isFuchsia ? 'bg-fuchsia-500' : 'bg-blue-500'; 
                              glowClass = isFuchsia ? 'shadow-[0_0_10px_rgba(217,70,239,0.8)]' : 'shadow-[0_0_10px_rgba(59,130,246,0.8)]';
                            }
                          } else if (tethered) {
                            opacityClass = 'opacity-100 scale-125';
                            dotColor = activeTether.color;
                            glowClass = 'animate-pulse';
                          } else if (isNearby || (isDragging && draggingId === item.instanceId)) {
                            opacityClass = 'opacity-40 scale-100';
                          }
                          
                          return (
                            <div key={lp.id} className={`absolute rounded-full border border-white shadow-sm transition-all duration-300 ${dotColor} ${glowClass} ${opacityClass}`} style={{ left: `${lp.x * 100}%`, top: `${lp.y * 100}%`, transform: 'translate(-50%, -50%)', width: 8, height: 8 }} />
                          );
                        })}
                      </div>
                    </div>
                  );
                  })}
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

      <div className="fixed bottom-8 left-8 z-[500] flex flex-col gap-2">
         <div onClick={() => gatherLayout('grid')} className="w-8 h-8 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center justify-center cursor-pointer hover:bg-slate-50 transition-all"><LayoutGrid size={16} className="text-slate-400" /></div>
         <div onClick={() => gatherLayout('tether')} className="w-8 h-8 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center justify-center cursor-pointer hover:bg-slate-50 transition-all"><Waypoints size={16} className="text-slate-400" /></div>
         <div onClick={() => setActiveFolderView('toolbox')} className="w-8 h-8 bg-slate-900 rounded-lg shadow-xl flex items-center justify-center cursor-pointer hover:scale-110 transition-transform active:scale-95 border border-white/20 mt-2"><Folder size={16} className="text-white" /></div>
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
