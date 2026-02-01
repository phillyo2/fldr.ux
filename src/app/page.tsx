
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { LayoutGrid, Waypoints, Folder, Plus, Minus, Settings, Compass, Zap, Package, Radio, Code2, Terminal, ChevronRight, ChevronLeft, LayoutTemplate, Home, Shuffle, Shield, Activity, Globe, Bell, Send, Cpu, Layers, Clock, HardDrive, GitBranch, Timer, Repeat } from 'lucide-react';
import { SafeIcon } from '@/components/SafeIcon';
import { AndroidFolder } from '@/components/AndroidFolder';
import { 
  CanvasItem, Connection, FolderData, FolderItem 
} from '@/lib/types';
import { 
  HEADER_OFFSET, SNAP_TOLERANCE, DETECTION_RANGE, 
  DRAG_THRESHOLD, LONG_PRESS_MS, LATCH_POINTS, GRID_SIZE 
} from '@/lib/constants';
import { getSmartPath, snapToGrid } from '@/lib/pathing';

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
        { name: 'Triggers', icon: 'Radio', isFolder: true, items: [] }
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

  const isAncestor = (potentialAncestorId: string, potentialDescendantId: string, conns: Connection[]) => {
    const visited = new Set<string>();
    const stack = [potentialAncestorId];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node === potentialDescendantId) return true;
      if (visited.has(node)) continue;
      visited.add(node);
      conns.filter(c => c.sourceId === node && !c.color.includes('fuchsia')).forEach(c => stack.push(c.targetId));
    }
    return false;
  };

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
        const nextContext = conn.sourceSide === 'left' ? `sub_${conn.targetId}` : context;
        contexts.set(conn.targetId, nextContext);
        queue.push({id: conn.targetId, context: nextContext});
      }
    }
    return contexts.get(nodeId) || null;
  };

  const calculateGhostHandshakes = (items: CanvasItem[], dId: string, dPos: {x: number, y: number} | null = null) => {
    const ghosts: Connection[] = [];
    const dragNode = dPos ? { ...items.find(i => i.instanceId === dId), ...dPos } : items.find(i => i.instanceId === dId);
    if (!dragNode) return ghosts;

    const isDragFuchsiaProvider = connRef.current.some(c => c.sourceId === dId && c.color.includes('fuchsia'));
    if (isDragFuchsiaProvider) return [];
    
    const dragCtx = getTreeContext(dId, connRef.current);

    const getPortPos = (item: any, side: string) => {
      if (side === 'top') return { x: item.x + 16, y: item.y };
      if (side === 'bottom') return { x: item.x + 16, y: item.y + 32 };
      if (side === 'right') return { x: item.x + 32, y: item.y + 16 };
      if (side === 'left') return { x: item.x, y: item.y + 16 };
      return { x: item.x + 16, y: item.y + 16 };
    };

    items.forEach(other => {
      if (other.instanceId === dId) return;
      const otherCtx = getTreeContext(other.instanceId, connRef.current);
      const isOtherFuchsiaProvider = connRef.current.some(c => c.sourceId === other.instanceId && c.color.includes('fuchsia'));
      if (isOtherFuchsiaProvider) return;
      
      LATCH_POINTS.forEach(lSource => {
        const lTarget = LATCH_POINTS.find(p => p.id === 'top')!;
        const sPos = getPortPos(dragNode, lSource.id);
        const tPos = getPortPos(other, lTarget.id);
        const dist = Math.sqrt(Math.pow(sPos.x - tPos.x, 2) + Math.pow(sPos.y - tPos.y, 2));

        if (dist < DETECTION_RANGE) {
          let color = lSource.color.replace('bg-', '');
          let valid = false;
          if (!dragCtx && otherCtx && lTarget.id === 'top' && lSource.id === 'bottom') {
            const dragHasAnyConnection = connRef.current.some(c => c.sourceId === dId || c.targetId === dId);
            if (!dragHasAnyConnection) { valid = true; color = 'fuchsia-500'; }
          }
          else if (dragCtx && !otherCtx && lSource.id !== 'top') { valid = true; }
          else if (dragCtx && otherCtx && dragCtx === otherCtx) {
            if (isAncestor(other.instanceId, dId, connRef.current)) {
              if ((lSource.id === 'bottom' || lSource.id === 'right') && lTarget.id === 'top') { valid = true; color = 'blue-500'; }
            }
          }
          if (valid) ghosts.push({ id: 'ghost', sourceId: dId, sourceSide: lSource.id, targetId: other.instanceId, targetSide: lTarget.id, color, dotDistance: dist } as any);
        }

        const sPosInv = getPortPos(other, lSource.id);
        const tPosInv = getPortPos(dragNode, lTarget.id);
        const distInv = Math.sqrt(Math.pow(sPosInv.x - tPosInv.x, 2) + Math.pow(sPosInv.y - tPosInv.y, 2));
        if (distInv < DETECTION_RANGE) {
          let color = lSource.color.replace('bg-', '');
          let valid = false;
          if (otherCtx && !dragCtx && lSource.id !== 'top') {
            const dragHasAnyConnection = connRef.current.some(c => c.sourceId === dId || c.targetId === dId);
            if (!dragHasAnyConnection) valid = true;
          }
          if (!otherCtx && dragCtx && lTarget.id === 'top' && lSource.id === 'bottom') {
             const otherHasAnyConnection = connRef.current.some(c => c.sourceId === other.instanceId || c.targetId === other.instanceId);
             if (!otherHasAnyConnection) { valid = true; color = 'fuchsia-500'; }
          }
          if (valid) ghosts.push({ id: 'ghost', sourceId: other.instanceId, sourceSide: lSource.id, targetId: dId, targetSide: lTarget.id, color, dotDistance: distInv } as any);
        }
      });
    });
    return ghosts.sort((a: any, b: any) => a.dotDistance - b.dotDistance);
  };

  const gatherLayout = (mode: 'grid' | 'tether') => {
    setLayoutMode(mode);
    setCanvasItems(prev => {
        const newItems = prev.map(item => ({ ...item }));
        const visited = new Set<string>();
        const occupied = new Set<string>();

        const isPositionOccupied = (x: number, y: number) => {
            for (const pos of occupied) {
                const [ox, oy] = pos.split(',').map(Number);
                if (Math.abs(ox - x) < 1 && Math.abs(oy - y) < 1) return true;
            }
            return false;
        };

        const modifiers = newItems.filter(i => !i.isOrigin && !connections.some(c => c.sourceId === i.instanceId || c.targetId === i.instanceId));
        const modCols = 4;
        modifiers.forEach((mod, idx) => {
            const col = idx % modCols;
            const row = Math.floor(idx / modCols);
            mod.x = snapToGrid(windowSize.w / 2 - (modCols * GRID_SIZE) / 2 + col * GRID_SIZE, 0);
            mod.y = snapToGrid(HEADER_OFFSET + row * GRID_SIZE, HEADER_OFFSET);
            visited.add(mod.instanceId);
            occupied.add(`${mod.x},${mod.y}`);
        });

        const roots = newItems.filter(i => {
            if (visited.has(i.instanceId)) return false;
            if (i.isOrigin) return true;
            const isFuchsiaSource = connections.some(c => c.sourceId === i.instanceId && c.color.includes('fuchsia'));
            if (isFuchsiaSource) return false;
            const incomingFlow = connections.some(c => c.targetId === i.instanceId && !c.color.includes('fuchsia'));
            return !incomingFlow;
        });

        const processNode = (nodeId: string, cx: number, cy: number) => {
            const incomingFuchsia = connections.filter(c => c.targetId === nodeId && c.color.includes('fuchsia'));
            incomingFuchsia.forEach(conn => {
                if (visited.has(conn.sourceId)) return;
                const fx = cx;
                const fy = cy - GRID_SIZE;
                const source = newItems.find(i => i.instanceId === conn.sourceId);
                if (source) {
                    source.x = fx; source.y = fy;
                    visited.add(source.instanceId); occupied.add(`${fx},${fy}`);
                    processNode(source.instanceId, fx, fy);
                }
            });

            const outgoing = connections.filter(c => c.sourceId === nodeId && !c.color.includes('fuchsia'));
            outgoing.forEach(conn => {
                if (visited.has(conn.targetId)) return;
                
                // Identify recursion nodes: tiles that have a blue output line back to an ancestor.
                const isPerformingRecursion = connections.some(c => 
                  c.sourceId === conn.targetId && 
                  !c.color.includes('emerald') && 
                  !c.color.includes('rose') && 
                  !c.color.includes('amber') &&
                  !c.color.includes('fuchsia') &&
                  isAncestor(c.targetId, conn.targetId, connections)
                );

                let step = GRID_SIZE;
                // Unsnap (64px stride) if we are in tether mode OR if this node is performing recursion.
                if (mode === 'tether' || (mode === 'grid' && isPerformingRecursion)) {
                    step = GRID_SIZE * 2; 
                }

                let tx = cx, ty = cy;
                if (conn.sourceSide === 'bottom') ty += step;
                else if (conn.sourceSide === 'right') tx += step;
                else if (conn.sourceSide === 'left') tx -= step;
                else if (conn.sourceSide === 'top') ty -= step;

                let safety = 0;
                while (isPositionOccupied(tx, ty) && safety < 10) { tx += GRID_SIZE; safety++; }

                const target = newItems.find(i => i.instanceId === conn.targetId);
                if (target) {
                    target.x = tx; target.y = ty;
                    visited.add(target.instanceId); occupied.add(`${tx},${ty}`);
                    processNode(target.instanceId, tx, ty);
                }
            });
        };

        let islandOffsetY = 0;
        roots.forEach((root, idx) => {
            let startX = root.isOrigin ? snapToGrid(windowSize.w / 2 - 16, 0) : snapToGrid(128 + idx * 256, 0);
            let startY = root.isOrigin ? snapToGrid(windowSize.h * 0.4, HEADER_OFFSET) : snapToGrid(windowSize.h * 0.6 + islandOffsetY, HEADER_OFFSET);
            root.x = startX; root.y = startY;
            visited.add(root.instanceId); occupied.add(`${startX},${startY}`);
            processNode(root.instanceId, startX, startY);
            islandOffsetY += 192;
        });

        const origin = newItems.find(i => i.isOrigin);
        if (origin) {
            const vx = - (origin.x - (windowSize.w / 2) + 16);
            const vy = - (origin.y - (windowSize.h / 2) + 16);
            setViewOffset({ x: vx, y: vy });
        }
        return newItems;
    });
  };

  const handleSmartBirth = (item: Partial<FolderItem>) => {
    const spawnX = snapToGrid(-viewOffset.x + windowSize.w / 2 - 16, 0);
    const spawnY = snapToGrid(-viewOffset.y + windowSize.h / 2 - 16, HEADER_OFFSET);
    setCanvasItems(prev => [...prev, { ...item, instanceId: `inst_${Date.now()}`, x: spawnX, y: spawnY, isRegistered: !item.isBuilder } as CanvasItem]);
    setActiveFolderView(null);
  };

  const handleCanvasPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
    const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
    setIsPanning(true); 
    panStart.current = { x: clientX, y: clientY }; 
    panOffsetStart.current = { ...viewOffset };
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

  const handleFolderSelect = (item: FolderItem) => {
    if (item.id) { setCurrentPageId(item.id); setActiveFolderView(null); } 
    else { handleSmartBirth(item); setActiveFolderView(null); }
  };

  const handleZoomIn = () => setZoom(prev => Math.min(2, prev + 0.1));
  const handleZoomOut = () => setZoom(prev => Math.max(0.5, prev - 0.1));

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'clientX' in e ? e.clientX : (e as TouchEvent).touches[0].clientX;
      const clientY = 'clientY' in e ? e.clientY : (e as TouchEvent).touches[0].clientY;
      
      if (dragStartPos && !isDragging) {
          const dist = Math.sqrt(Math.pow(clientX - dragStartPos.x, 2) + Math.pow(clientY - dragStartPos.y, 2));
          if (dist > DRAG_THRESHOLD) { 
            setIsDragging(true); 
            setDraggingId(dragStartPos.id); 
            if (pressTimer.current) clearTimeout(pressTimer.current); 
          }
      }

      if (!isDragging && !isPanning) return;
      
      if (isPanning) {
        const dx = clientX - panStart.current.x;
        const dy = clientY - panStart.current.y;
        setViewOffset({ x: panOffsetStart.current.x + dx, y: panOffsetStart.current.y + dy });
        return;
      }

      const x = (clientX - viewOffset.x) / zoom - mouseOffset.current.x; 
      const y = (clientY - viewOffset.y) / zoom - mouseOffset.current.y;
      setCanvasItems(prev => prev.map(i => i.instanceId === draggingId ? { ...i, x, y } : i));
      
      const ghosts = calculateGhostHandshakes(itemsRef.current, draggingId!, { x, y });
      const best = ghosts[0] as any;
      
      if (best && (activeTether || best.dotDistance < SNAP_TOLERANCE)) {
        setActiveTether({ ...best });
      }
    };

    const handleUp = (e: MouseEvent | TouchEvent) => {
      setDragStartPos(null); 
      if (pressTimer.current) clearTimeout(pressTimer.current);
      
      if (isPanning) { 
        setViewOffset(prev => ({ x: snapToGrid(prev.x, 0), y: snapToGrid(prev.y, 0) })); 
        setIsPanning(false); 
        return; 
      }

      if (!isDragging) return; 
      
      setCanvasItems(prev => {
        const item = prev.find(i => i.instanceId === draggingId); if (!item) return prev;
        let finalX = snapToGrid(item.x, 0); let finalY = snapToGrid(item.y, HEADER_OFFSET);
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
    window.addEventListener('touchmove', handleMove); window.addEventListener('touchmove', handleMove); window.addEventListener('touchend', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); window.removeEventListener('touchmove', handleMove); window.removeEventListener('touchend', handleUp); };
  }, [isDragging, isPanning, draggingId, activeTether, dragStartPos, viewOffset, currentPageId, zoom, windowSize]); 

  return (
    <div className="relative w-full h-screen bg-white overflow-hidden select-none font-sans">
      <main className="absolute inset-0 overflow-hidden">
        <div className="w-full h-full relative overflow-hidden bg-white" onMouseDown={handleCanvasPointerDown} onTouchStart={handleCanvasPointerDown} onContextMenu={(e) => e.preventDefault()} style={{ touchAction: 'none' }}>
          <div className="absolute inset-0 pointer-events-none opacity-100" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, #E2E8F0 2.5px, transparent 0)`, backgroundSize: `${32 * zoom}px ${32 * zoom}px`, backgroundPosition: `${(viewOffset.x + 16 * zoom) % (32 * zoom)}px ${(viewOffset.y + 16 * zoom) % (32 * zoom)}px` }} />

          <div style={{ transform: `translate(${viewOffset.x}px, ${viewOffset.y}px) scale(${zoom})`, transformOrigin: '0 0' }} className={`w-full h-full relative`}>
              {currentPageId === 'studio' ? (
                <>
                  <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0 overflow-visible">
                      {connections.map(conn => {
                          const s = canvasItems.find(i => i.instanceId === conn.sourceId), t = canvasItems.find(i => i.instanceId === conn.targetId);
                          if(!s || !t) return null;
                          const sX = s.x + (conn.sourceSide === 'right' ? 32 : (conn.sourceSide === 'left' ? 0 : 16)), sY = s.y - HEADER_OFFSET + (conn.sourceSide === 'bottom' ? 32 : (conn.sourceSide === 'top' ? 0 : 16));
                          const tX = t.x + (conn.targetSide === 'right' ? 32 : (conn.targetSide === 'left' ? 0 : 16)), tY = t.y - HEADER_OFFSET + (conn.targetSide === 'bottom' ? 32 : (conn.targetSide === 'top' ? 0 : 16));
                          
                          const dist = Math.sqrt(Math.pow(sX - tX, 2) + Math.pow(sY - tY, 2));
                          const isFuchsia = conn.color.includes('fuchsia');
                          const isEmerald = conn.color.includes('emerald');
                          const isRose = conn.color.includes('rose');
                          
                          // Persistent Lines: Emerald, Fuchsia, and Rose execution flows always show even when adjacent
                          const isPersistent = isFuchsia || isEmerald || isRose;
                          if (!isPersistent && dist < 48) return null;

                          const pathData = getSmartPath(sX, sY, tX, tY, conn.sourceSide, conn.targetSide, conn.sourceId, conn.targetId, canvasItems);
                          let strokeColor = '#3B82F6'; 
                          if (conn.color.includes('emerald')) strokeColor = '#10B981';
                          else if (conn.color.includes('rose')) strokeColor = '#F43F5E';
                          else if (conn.color.includes('amber')) strokeColor = '#FBBF24';
                          else if (conn.color.includes('fuchsia')) strokeColor = '#D946EF';
                          return (
                            <React.Fragment key={conn.id}>
                              <path d={pathData.d} stroke={strokeColor} strokeWidth={3 / zoom} fill="none" strokeLinecap="round" />
                              <circle 
                                cx={pathData.mid.x} cy={pathData.mid.y} r={8 / zoom} 
                                fill="white" stroke={strokeColor} strokeWidth={2 / zoom} 
                                className="pointer-events-auto cursor-pointer hover:scale-125 transition-transform shadow-sm" 
                                onClick={(e) => { e.stopPropagation(); deleteConnection(conn.id); }}
                              />
                            </React.Fragment>
                          );
                      })}
                      {activeTether && (() => {
                          const s = canvasItems.find(i => i.instanceId === activeTether.sourceId), t = canvasItems.find(i => i.instanceId === activeTether.targetId);
                          if(!s || !t) return null;
                          const sX = s.x + (activeTether.sourceSide === 'right' ? 32 : (activeTether.sourceSide === 'left' ? 0 : 16)), sY = s.y - HEADER_OFFSET + (activeTether.sourceSide === 'bottom' ? 32 : (activeTether.sourceSide === 'top' ? 0 : 16));
                          const tX = t.x + (activeTether.targetSide === 'right' ? 32 : (activeTether.targetSide === 'left' ? 0 : 16)), tY = t.y - HEADER_OFFSET + (activeTether.targetSide === 'bottom' ? 32 : (activeTether.targetSide === 'top' ? 0 : 16));
                          const pathData = getSmartPath(sX, sY, tX, tY, activeTether.sourceSide, activeTether.targetSide, activeTether.sourceId, activeTether.targetId, canvasItems);
                          let strokeColor = '#3B82F6';
                          if (activeTether.color.includes('emerald')) strokeColor = '#10B981';
                          else if (activeTether.color.includes('rose')) strokeColor = '#F43F5E';
                          else if (activeTether.color.includes('amber')) strokeColor = '#FBBF24';
                          else if (activeTether.color.includes('fuchsia')) strokeColor = '#D946EF';
                          return <path d={pathData.d} stroke={strokeColor} strokeWidth={3 / zoom} fill="none" strokeDasharray={`${6/zoom},${4/zoom}`} className="opacity-50" />;
                      })()}
                  </svg>
                  {canvasItems.map(item => (
                    <div key={item.instanceId} onMouseDown={(e) => handleItemPointerDown(e, item)} onMouseUp={() => handleItemPointerUp(item)} onTouchStart={(e) => handleItemPointerDown(e, item)} onTouchEnd={() => handleItemPointerUp(item)}
                      className={`absolute cursor-pointer flex items-center justify-center ${isDragging && draggingId === item.instanceId ? 'z-[1000]' : ''}`} style={{ left: item.x, top: item.y - HEADER_OFFSET, width: 32, height: 32 }}>
                      <div className={`w-[30px] h-[30px] ${item.isOrigin ? 'bg-slate-900' : 'bg-white'} rounded-md shadow-sm flex items-center justify-center border relative ${item.isOrigin ? 'border-slate-800' : (item.isRegistered ? 'border-slate-200' : 'border-emerald-300')}`}>
                        {item.isOrigin ? <Shield size={16} className="text-white" /> : <SafeIcon name={item.icon} size={16} className={item.isRegistered ? 'text-slate-800' : 'text-emerald-500'} />}
                        {LATCH_POINTS.map(lp => {
                          const connectedAsSource = connections.find(c => c.sourceId === item.instanceId && c.sourceSide === lp.id);
                          const connectedAsTarget = connections.find(c => c.targetId === item.instanceId && c.targetSide === lp.id);
                          const tethered = activeTether && ((activeTether.sourceId === item.instanceId && activeTether.sourceSide === lp.id) || (activeTether.targetId === item.instanceId && activeTether.targetSide === lp.id));
                          
                          let dotColor = 'bg-slate-200';
                          let opacityClass = 'opacity-0 scale-50';

                          if (connectedAsSource || connectedAsTarget || tethered) {
                            opacityClass = 'opacity-100 scale-100';

                            // Proximity-Based Dot Culling: Hide dot if snapped directly to its counterpart anchor
                            // Recalibrated to 24px to catch adjacent-cell diagonals while excluding 64px recursive gaps
                            const connection = connectedAsSource || connectedAsTarget || (tethered ? activeTether : null);
                            if (connection) {
                              const isSource = (connection.sourceId === item.instanceId && connection.sourceSide === lp.id);
                              const otherId = isSource ? connection.targetId : connection.sourceId;
                              const otherSide = isSource ? connection.targetSide : connection.sourceSide;
                              const otherItem = canvasItems.find(i => i.instanceId === otherId);
                              const otherLp = LATCH_POINTS.find(p => p.id === otherSide);

                              if (otherItem && otherLp) {
                                const myX = item.x + lp.x * 32;
                                const myY = item.y + lp.y * 32;
                                const itsX = otherItem.x + otherLp.x * 32;
                                const itsY = otherItem.y + otherLp.y * 32;
                                const dist = Math.sqrt(Math.pow(myX - itsX, 2) + Math.pow(myY - itsY, 2));

                                if (dist < 24) {
                                  opacityClass = 'opacity-0 scale-50';
                                }
                              }
                            }

                            if (lp.id === 'bottom') dotColor = 'bg-emerald-500';
                            else if (lp.id === 'right') dotColor = 'bg-rose-500';
                            else if (lp.id === 'left') dotColor = 'bg-amber-400';
                            else { 
                              const isFuchsia = connections.some(c => c.targetId === item.instanceId && c.targetSide === 'top' && c.color.includes('fuchsia'));
                              const activeIsFuchsia = activeTether && activeTether.targetId === item.instanceId && activeTether.targetSide === 'top' && activeTether.color.includes('fuchsia');
                              dotColor = (isFuchsia || activeIsFuchsia) ? 'bg-fuchsia-500' : 'bg-blue-500'; 
                            }
                          }
                          return <div key={lp.id} className={`absolute rounded-full border border-white shadow-sm transition-all duration-300 ${dotColor} ${opacityClass}`} style={{ left: `${lp.x * 100}%`, top: `${lp.y * 100}%`, transform: 'translate(-50%, -50%)', width: 8 / zoom, height: 8 / zoom }} />;
                        })}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="p-12 max-w-5xl">
                   <h1 className="text-4xl font-black italic uppercase text-slate-800 mb-8">Dashboard</h1>
                   <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm w-64 h-32 flex flex-col justify-center">
                       <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total Nodes</p>
                       <p className="text-4xl font-black text-slate-800">{canvasItems.length}</p>
                   </div>
                </div>
              )}
          </div>
        </div>
      </main>

      {/* Discrete Grid-Snapped Action Tiles - Fixed 28px Offset */}
      <div onClick={() => gatherLayout('grid')} title="Grid Gather" className="fixed top-[28px] right-[28px] z-[1000] w-[32px] h-[32px] bg-white flex items-center justify-center cursor-pointer hover:bg-slate-50 transition-all active:scale-95 border border-slate-200 rounded-md shadow-sm p-0 box-border">
        <LayoutGrid size={20} className="text-slate-600" />
      </div>
      <div onClick={() => gatherLayout('tether')} title="Tether Gather" className="fixed top-[60px] right-[28px] z-[1000] w-[32px] h-[32px] bg-white flex items-center justify-center cursor-pointer hover:bg-slate-50 transition-all active:scale-95 border border-slate-200 rounded-md shadow-sm p-0 box-border">
        <Waypoints size={20} className="text-slate-600" />
      </div>

      <div onClick={handleZoomIn} title="Zoom In" className="fixed top-[calc(50vh-32px)] right-[28px] z-[1000] w-[32px] h-[32px] bg-white flex items-center justify-center cursor-pointer hover:bg-slate-50 transition-all active:scale-95 border border-slate-200 rounded-md shadow-sm p-0 box-border">
        <Plus size={20} className="text-slate-700" />
      </div>
      <div onClick={handleZoomOut} title="Zoom Out" className="fixed top-[50vh] right-[28px] z-[1000] w-[32px] h-[32px] bg-white flex items-center justify-center cursor-pointer hover:bg-slate-50 transition-all active:scale-95 border border-slate-200 rounded-md shadow-sm p-0 box-border">
        <Minus size={20} className="text-slate-700" />
      </div>

      <div onClick={() => setActiveFolderView('toolbox')} className="fixed bottom-[28px] left-[28px] z-[500] w-[32px] h-[32px] bg-slate-900 rounded-md shadow-md flex items-center justify-center cursor-pointer hover:scale-105 transition-transform active:scale-95 border border-slate-800 p-0 box-border">
        <Folder size={20} className="text-white" />
      </div>
      <div onClick={() => setActiveFolderView('nav')} className="fixed bottom-[28px] right-[28px] z-[500] w-[32px] h-[32px] bg-blue-600 rounded-md shadow-md flex items-center justify-center cursor-pointer hover:scale-105 transition-transform active:scale-95 border border-blue-700 p-0 box-border">
        <Compass size={20} className="text-white" />
      </div>

      <AndroidFolder title={navData.title} icon={navData.icon} color={navData.color} items={navData.items} isOpen={activeFolderView === 'nav'} onClose={() => setActiveFolderView(null)} onSelect={handleFolderSelect} />
      <AndroidFolder title={toolboxData.title} icon={toolboxData.icon} color={toolboxData.color} items={toolboxData.items} isOpen={activeFolderView === 'toolbox'} onClose={() => setActiveFolderView(null)} onSelect={handleFolderSelect} />

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
