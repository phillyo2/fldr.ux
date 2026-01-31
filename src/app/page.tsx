
"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { SafeIcon } from '@/components/SafeIcon';
import { AndroidFolder } from '@/components/AndroidFolder';
import { 
  CanvasItem, Connection, FolderData 
} from '@/lib/types';
import { 
  HEADER_OFFSET, LATCH_POINTS, SNAP_TOLERANCE, DETECTION_RANGE, TETHER_DELAY, 
  UNIT_SIZE_VAL, DRAG_THRESHOLD, LONG_PRESS_MS, SELECTABLE_ICONS 
} from '@/lib/constants';
import { getSmartPath, snapToGrid } from '@/lib/pathing';

export default function App() {
  // --- STATE ---
  const [currentPageId, setCurrentPageId] = useState('studio');
  const [activeFolderView, setActiveFolderView] = useState<string | null>(null);
  const [windowSize, setWindowSize] = useState({ w: 1024, h: 768 });
  
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([
    { instanceId: 'entry_origin', name: 'Entry Point', icon: 'Shield', x: 128, y: 128 + HEADER_OFFSET, isRegistered: true, isOrigin: true }
  ]);
  const [connections, setConnections] = useState<Connection[]>([]); 
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  
  const [isDragging, setIsDragging] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null); 
  const [isPanning, setIsPanning] = useState(false);
  const [trashActive, setTrashActive] = useState(false);
  const [ghostConnections, setGhostConnections] = useState<Connection[]>([]);
  const [dragStartPos, setDragStartPos] = useState<{id: string, x: number, y: number} | null>(null); 

  const [activeTether, setActiveTether] = useState<Connection | null>(null); 
  const [draggingWireId, setDraggingWireId] = useState<string | null>(null); 
  const [wireDragStart, setWireDragStart] = useState<{x: number, y: number} | null>(null);   
  const tetherTimer = useRef<NodeJS.Timeout | null>(null);
  const [simulatedOffset, setSimulatedOffset] = useState(0);
  const [isDraggingDrawer, setIsDraggingDrawer] = useState(false);

  // Gesture State for Drawer
  const touchStartY = useRef<number | null>(null);
  const initialOffset = useRef<number>(0);
  const dragDistance = useRef<number>(0);
  const offsetRef = useRef(simulatedOffset);

  const [foldersRegistry, setFoldersRegistry] = useState<Record<string, FolderData>>({
    'actions': { id: 'actions', title: 'Actions', icon: 'Zap', color: 'bg-blue-600', items: [
        { name: 'New Action', icon: 'Plus', isBuilder: true },
        { name: 'Terminal Log', icon: 'Terminal' },
        { name: 'Cloud Request', icon: 'Globe' },
        { name: 'Delay 1s', icon: 'Timer', setup: 'DURATION_MS' }
    ]},
    'triggers': { id: 'triggers', title: 'Triggers', icon: 'Radio', color: 'bg-orange-500', items: [
        { name: 'On Interaction', icon: 'MousePointer2', isTrigger: true },
        { name: 'On Clock', icon: 'Clock', isTrigger: true }
    ]},
    'logic': { id: 'logic', title: 'Logic', icon: 'Code2', color: 'bg-purple-600', items: [
        { name: 'Branch (If)', icon: 'GitBranch' },
        { name: 'Switch', icon: 'Shuffle' },
        { name: 'Loop', icon: 'Repeat' },
        { name: 'Sequencer', icon: 'Layers' }
    ]}
  });

  const itemsRef = useRef(canvasItems);
  const connRef = useRef(connections);
  useEffect(() => { itemsRef.current = canvasItems; }, [canvasItems]);
  useEffect(() => { connRef.current = connections; }, [connections]);
  useEffect(() => { offsetRef.current = simulatedOffset; }, [simulatedOffset]);

  const lastTap = useRef(0);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const mouseOffset = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const panOffsetStart = useRef({ x: 0, y: 0 });
  const lastValidPos = useRef({ x: 128, y: 184 });

  const [editingItem, setEditingItem] = useState<CanvasItem | null>(null);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [studioName, setStudioName] = useState("");
  const [studioIcon, setStudioIcon] = useState("Terminal");
  const [studioPayload, setStudioPayload] = useState("");
  const [studioLogic, setStudioLogic] = useState("");
  const [studioSetup, setStudioSetup] = useState("");

  const [isDeploymentOpen, setIsDeploymentOpen] = useState(false);
  const [deploymentValues, setDeploymentValues] = useState({});

  useEffect(() => {
    setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    const handleResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const poweredNodes = useMemo(() => {
    const powered = new Set();
    const origins = canvasItems.filter(i => i.isOrigin);
    const queue = origins.map(o => o.instanceId);
    origins.forEach(o => powered.add(o.instanceId));
    let safety = 0;
    while(queue.length > 0 && safety < 1000) {
      const currentId = queue.shift();
      const outgoing = connections.filter(c => c.sourceId === currentId);
      outgoing.forEach(conn => {
        if (!powered.has(conn.targetId)) { powered.add(conn.targetId); queue.push(conn.targetId); }
      });
      safety++;
    }
    return powered;
  }, [canvasItems, connections]);

  const isDescendantOf = (childId: string, potentialParentId: string, currentConns: Connection[]) => {
    const stack = [potentialParentId];
    const visited = new Set();
    while (stack.length > 0) {
        const curr = stack.pop();
        if (curr === childId) return true;
        if (visited.has(curr)) continue;
        visited.add(curr);
        currentConns.filter(c => c.sourceId === curr).forEach(c => stack.push(c.targetId));
    }
    return false;
  };

  const calculateGhostHandshakes = (items: CanvasItem[], dId: string, dPos: {x: number, y: number} | null = null) => {
    if (activeTether) return [];
    const ghosts: Connection[] = [];
    const dragNode = dPos ? { ...items.find(i => i.instanceId === dId), ...dPos } : items.find(i => i.instanceId === dId);
    if (!dragNode) return ghosts;

    items.forEach(other => {
      if (other.instanceId === dId) return;

      const dx = (dragNode.x || 0) - other.x; const dy = (dragNode.y || 0) - other.y;
      const adx = Math.abs(dx); const ady = Math.abs(dy);
      
      const isRecursion = isDescendantOf(other.instanceId, dId, connRef.current);
      
      // Proximity check for revealing dots (Stage 1)
      if (adx > DETECTION_RANGE || ady > DETECTION_RANGE) return;

      let targetPort = null; let sourcePort = null;
      let color = 'bg-slate-300';

      // Logic: Source determines color and port based on relative position
      if (adx < SNAP_TOLERANCE) {
          if (dy > 0) { targetPort = 'bottom'; sourcePort = 'top'; color = 'bg-emerald-500'; } // Success Flow
          else { targetPort = 'top'; sourcePort = 'bottom'; color = 'bg-blue-500'; } // Generic Input
      } else if (ady < SNAP_TOLERANCE) {
          if (dx > 0) { targetPort = 'right'; sourcePort = 'left'; color = 'bg-rose-500'; } // Error Flow
          else { targetPort = 'left'; sourcePort = 'right'; color = 'bg-amber-400'; } // Peek/Attach
      }

      // Recursion Rule: Force Blue Snap
      if (isRecursion) {
          targetPort = 'top'; 
          color = 'bg-blue-500';
          // Determine which side of source we are exiting
          if (dy > adx) sourcePort = 'bottom';
          else if (dx > ady) sourcePort = 'right';
          else sourcePort = 'left';
      }

      if (targetPort && sourcePort) {
          const snapX = other.x + (targetPort === 'right' ? 32 : (targetPort === 'left' ? -32 : 0));
          const snapY = other.y + (targetPort === 'bottom' ? 32 : (targetPort === 'top' ? -32 : 0));
          
          // Calculate distance between latch points for "Touching" (Stage 2)
          const dotDist = Math.sqrt(Math.pow(snapX - dragNode.x, 2) + Math.pow(snapY - dragNode.y, 2));

          ghosts.push({ 
            id: 'ghost',
            sourceId: other.instanceId, sourceSide: targetPort, targetId: dId, targetSide: sourcePort,
            color, displayColor: color, snapX, snapY,
            dotDistance: dotDist // Custom field for tracking touching
          } as any);
      }
    });

    if (ghosts.length === 0) return [];
    
    // Nearest Point Rule
    ghosts.sort((a: any, b: any) => a.dotDistance - b.dotDistance);
    
    return [ghosts[0]];
  };

  const handleSmartBirth = (item: Partial<CanvasItem>) => {
    const spawnX = -viewOffset.x + 32; 
    const spawnY = -viewOffset.y + 32 + HEADER_OFFSET;
    setCanvasItems(prev => [...prev, { ...item, instanceId: `inst_${Date.now()}`, x: spawnX, y: spawnY, isRegistered: !item.isBuilder } as CanvasItem]);
    setActiveFolderView(null); animateTo(0); 
  };

  const animateTo = (target: number) => {
    setIsDraggingDrawer(false);
    const start = offsetRef.current; 
    const startTime = performance.now();
    const duration = 60; 
    const step = (now: number) => {
      const p = Math.min((now - startTime) / duration, 1); 
      const easedP = p * (2 - p);
      setSimulatedOffset(start + (target - start) * easedP); 
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const finalizeActionDNA = () => {
    if (!editingItem) return;
    const dna = { name: studioName, icon: studioIcon, payload: studioPayload, logic: studioLogic, setup: studioSetup, isRegistered: true };
    setCanvasItems(prev => prev.map(i => i.instanceId === editingItem.instanceId ? { ...i, ...dna } : i));
    
    setFoldersRegistry(prev => {
        const exists = prev.actions.items.some(i => i.name === dna.name);
        if (exists) return prev;
        return {
            ...prev,
            actions: { ...prev.actions, items: [...prev.actions.items, { ...dna }] }
        };
    });
    setIsStudioOpen(false); setEditingItem(null);
  };

  const handleCanvasPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
      const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
      setIsPanning(true); 
      panStart.current = { x: clientX, y: clientY }; 
      panOffsetStart.current = { ...viewOffset };
    }
    lastTap.current = now;
  };

  const handleItemPointerDown = (e: React.MouseEvent | React.TouchEvent, item: CanvasItem) => {
    e.stopPropagation();
    const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
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
        if (item.isRegistered) {
           const vars = item.setup ? item.setup.split(',').map(s => s.trim()).filter(Boolean) : [];
           if (vars.length > 0) { setEditingItem(item); setDeploymentValues({}); setIsDeploymentOpen(true); }
        } else {
           setEditingItem(item); setStudioName(item.name || ""); setStudioIcon(item.icon || "Terminal");
           setStudioPayload(""); setStudioLogic(""); setStudioSetup(""); setIsStudioOpen(true);
        }
      }
    }
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
      const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;

      if (dragStartPos && !isDragging && !draggingWireId) {
          const dist = Math.sqrt(Math.pow(clientX - dragStartPos.x, 2) + Math.pow(clientY - dragStartPos.y, 2));
          if (dist > DRAG_THRESHOLD) { setIsDragging(true); setDraggingId(dragStartPos.id); if (pressTimer.current) clearTimeout(pressTimer.current); }
      }

      if (!isDragging && !isPanning && !draggingWireId) return;

      if (isPanning) {
        setViewOffset({ x: panOffsetStart.current.x + (clientX - panStart.current.x), y: panOffsetStart.current.y + (clientY - panStart.current.y) });
        return;
      }

      if (draggingWireId) {
          const worldX = clientX - viewOffset.x; const worldY = clientY - viewOffset.y - HEADER_OFFSET; 
          setConnections(prev => prev.map(c => c.id === draggingWireId ? { ...c, waypoint: { x: worldX, y: worldY } } : c));
          return;
      }

      const x = clientX - mouseOffset.current.x; const y = clientY - mouseOffset.current.y;
      setCanvasItems(prev => prev.map(i => i.instanceId === draggingId ? { ...i, x, y } : i));
      
      const ghosts = calculateGhostHandshakes(itemsRef.current, draggingId!, { x, y });
      setGhostConnections(ghosts);

      if (!activeTether) {
          const best = ghosts[0] as any;
          // Handshake logic: dots must be "touching" (dist < 12) for duration
          if (best && best.dotDistance < 12) {
              if (!tetherTimer.current) {
                  tetherTimer.current = setTimeout(() => {
                      if(best) { setActiveTether({ ...best }); setGhostConnections([]); }
                  }, TETHER_DELAY);
              }
          } else { 
              if (tetherTimer.current) { clearTimeout(tetherTimer.current); tetherTimer.current = null; } 
          }
      } else { 
          setGhostConnections([]); 
          // Check if we pulled away
          const distToSnap = Math.sqrt(Math.pow(activeTether.snapX! - x, 2) + Math.pow(activeTether.snapY! - y, 2));
          if (distToSnap > 48) setActiveTether(null);
      }
      setTrashActive(clientY > window.innerHeight - 100);
    };

    const handleUp = (e: MouseEvent | TouchEvent) => {
      setDragStartPos(null); if (pressTimer.current) clearTimeout(pressTimer.current);
      if (draggingWireId) {
          setDraggingWireId(null);
          const cX = 'clientX' in e ? e.clientX : (e as TouchEvent).changedTouches[0].clientX;
          const cY = 'clientY' in e ? e.clientY : (e as TouchEvent).changedTouches[0].clientY;
          if (wireDragStart && Math.sqrt(Math.pow(cX - wireDragStart.x, 2) + Math.pow(cY - wireDragStart.y, 2)) < DRAG_THRESHOLD) setConnections(prev => prev.filter(c => c.id !== draggingWireId));
          setWireDragStart(null); return;
      }
      if (isPanning) { setViewOffset(prev => ({ x: snapToGrid(prev.x, 0), y: snapToGrid(prev.y, 0) })); setIsPanning(false); return; }
      if (tetherTimer.current) { clearTimeout(tetherTimer.current); tetherTimer.current = null; }
      if (!isDragging) return; 

      const droppedItem = itemsRef.current.find(i => i.instanceId === draggingId);
      if (!droppedItem) return; 
      
      const instantGhosts = calculateGhostHandshakes(itemsRef.current, draggingId!, { x: droppedItem.x, y: droppedItem.y });
      const bestSnap = instantGhosts[0]; 

      setCanvasItems(prev => {
        const item = prev.find(i => i.instanceId === draggingId);
        if (!item) return prev;
        let finalX = snapToGrid(item.x, 0); let finalY = snapToGrid(item.y, HEADER_OFFSET);
        if (bestSnap && !activeTether) { finalX = bestSnap.snapX!; finalY = bestSnap.snapY!; }
        const isOccupied = prev.some(other => other.instanceId !== draggingId && Math.abs(other.x - finalX) < 5 && Math.abs(other.y - finalY) < 5);
        if (isOccupied) return prev.map(i => i.instanceId === draggingId ? { ...i, x: lastValidPos.current.x, y: lastValidPos.current.y } : i);
        return prev.map(i => i.instanceId === draggingId ? { ...i, x: finalX, y: finalY, isNew: false } : i);
      });

      if (activeTether) { setConnections(prev => [...prev, { ...activeTether, id: `conn_${Date.now()}` }]); } 
      else if (bestSnap && (bestSnap as any).dotDistance < 12) { setConnections(prev => [...prev, { ...bestSnap, id: `conn_${Date.now()}` }]); }
      setActiveTether(null); setGhostConnections([]); setIsDragging(false); setDraggingId(null); setTrashActive(false);
    };
    window.addEventListener('mousemove', handleMove); window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove); window.addEventListener('touchend', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); window.removeEventListener('touchmove', handleMove); window.removeEventListener('touchend', handleUp); };
  }, [isDragging, isPanning, draggingId, activeTether, draggingWireId, dragStartPos, viewOffset, wireDragStart]); 

  // --- DRAWER GESTURES ---
  const handleDrawerPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
    touchStartY.current = clientY;
    initialOffset.current = offsetRef.current;
    dragDistance.current = 0;
    setIsDraggingDrawer(true);
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (touchStartY.current === null) return;
      const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
      const delta = touchStartY.current - clientY;
      dragDistance.current = Math.abs(delta);
      const sensitivity = 160; 
      const nextOffset = Math.max(0, Math.min(1, initialOffset.current + delta / sensitivity));
      setSimulatedOffset(nextOffset);
    };

    const handleUp = () => {
      if (touchStartY.current === null) return;
      touchStartY.current = null;
      if (dragDistance.current > 15) {
          if (offsetRef.current > 0.4) animateTo(1);
          else animateTo(0);
      } else {
        setIsDraggingDrawer(false);
      }
    };

    window.addEventListener('mousemove', handleMove); window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove); window.addEventListener('touchend', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); window.removeEventListener('touchmove', handleMove); window.removeEventListener('touchend', handleUp); };
  }, []);

  const handleOpenFolder = (fId: string) => {
    if (offsetRef.current < 0.8) animateTo(1);
    else setActiveFolderView(fId);
  };

  const handleLauncherNavigate = (pageId: string) => {
    setCurrentPageId(pageId);
    setActiveFolderView(null);
    animateTo(0);
  };

  return (
    <div className="relative w-full h-screen bg-[#F8FAFC] overflow-hidden select-none font-sans">
      <nav className="fixed top-0 left-0 right-0 h-14 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-8 z-[60]">
        <div className="flex items-center gap-4">
           <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white font-black shadow-lg"><SafeIcon name="Zap" size={16} fill="white"/></div>
           <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{currentPageId === 'home' ? 'Dashboard' : 'Logic Studio'}</span>
        </div>
        <div className="text-[8px] font-black uppercase text-slate-400 border border-slate-200 px-3 py-1 rounded-full tracking-widest italic">v11.51 KINETIC</div>
      </nav>

      <main className="absolute inset-0 mt-14 overflow-hidden">
        {currentPageId === 'studio' ? (
          <div className="w-full h-full relative overflow-hidden bg-slate-50" 
             onMouseDown={handleCanvasPointerDown} onTouchStart={handleCanvasPointerDown} 
             onContextMenu={(e) => e.preventDefault()}
             style={{ touchAction: 'none' }}>
            
            <div className="absolute inset-0 pointer-events-none opacity-100" 
               style={{ 
                   backgroundImage: `
                      radial-gradient(circle at 1px 1px, #E2E8F0 2px, transparent 0),
                      url("data:image/svg+xml,%3Csvg width='32' height='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M16 12v8M12 16h8' stroke='%23cbd5e1' stroke-width='0.3' stroke-linecap='round'/%3E%3C/svg%3E")
                   `, 
                   backgroundSize: `32px 32px, 32px 32px`,
                   backgroundPosition: `${(viewOffset.x + 16) % 32}px ${(viewOffset.y + 16) % 32}px, ${(viewOffset.x + 16) % 32}px ${(viewOffset.y + 16) % 32}px`,
                   backgroundRepeat: 'repeat, repeat'
               }} 
            />

            <div style={{ transform: `translate(${viewOffset.x}px, ${viewOffset.y}px)` }} className="w-full h-full relative">
                <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0 overflow-visible">
                    <defs>
                        {connections.map(conn => {
                            const c = conn.color.includes('rose') ? '#F43F5E' : conn.color.includes('emerald') ? '#10B981' : conn.color.includes('blue') ? '#3B82F6' : '#FBBF24';
                            return (
                                <linearGradient key={`grad-${conn.id}`} id={`grad-${conn.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor={c} />
                                    <stop offset="50%" stopColor={c} stopOpacity="0.8" />
                                    <stop offset="100%" stopColor={c} />
                                </linearGradient>
                            );
                        })}
                    </defs>
                    
                    {connections.map(conn => {
                        const s = canvasItems.find(i => i.instanceId === conn.sourceId), t = canvasItems.find(i => i.instanceId === conn.targetId);
                        if(!s || !t) return null;

                        // Stealth Connection: Hide path IF adjacent
                        const isAdjacent = Math.abs(s.x - t.x) < 35 && Math.abs(s.y - t.y) < 35;
                        if (isAdjacent) return null;

                        const sX = s.x + (conn.sourceSide === 'right' ? 32 : (conn.sourceSide === 'left' ? 0 : 16)), sY = s.y - HEADER_OFFSET + (conn.sourceSide === 'bottom' ? 32 : (conn.sourceSide === 'top' ? 0 : 16));
                        const tX = t.x + (conn.targetSide === 'right' ? 32 : (conn.targetSide === 'left' ? 0 : 16)), tY = t.y - HEADER_OFFSET + (conn.targetSide === 'bottom' ? 32 : (conn.targetSide === 'top' ? 0 : 16));
                        
                        let d = conn.waypoint 
                            ? `M ${sX} ${sY} L ${conn.waypoint.x} ${sY} L ${conn.waypoint.x} ${conn.waypoint.y} L ${tX} ${conn.waypoint.y} L ${tX} ${tY}` 
                            : getSmartPath(sX, sY, tX, tY, conn.sourceSide, conn.targetSide, conn.id);
                            
                        return <path key={conn.id} d={d} stroke={`url(#grad-${conn.id})`} strokeWidth="3.5" fill="none" strokeLinecap="round" className="drop-shadow-sm transition-all duration-75" />;
                    })}
                    
                    {activeTether && (() => {
                        const s = canvasItems.find(i => i.instanceId === activeTether.sourceId), t = canvasItems.find(i => i.instanceId === draggingId);
                        if (!s || !t) return null;
                        
                        const isAdjacent = Math.abs(s.x - t.x) < 35 && Math.abs(s.y - t.y) < 35;
                        if (isAdjacent) return null;

                        const sX = s.x + (activeTether.sourceSide === 'right' ? 32 : (activeTether.sourceSide === 'left' ? 0 : 16)), sY = s.y - HEADER_OFFSET + (activeTether.sourceSide === 'bottom' ? 32 : (activeTether.sourceSide === 'top' ? 0 : 16));
                        const tX = t.x + (activeTether.targetSide === 'right' ? 32 : (activeTether.targetSide === 'left' ? 0 : 16)), tY = t.y - HEADER_OFFSET + (activeTether.targetSide === 'bottom' ? 32 : (activeTether.targetSide === 'top' ? 0 : 16));
                        const c = activeTether.color.includes('rose') ? '#F43F5E' : activeTether.color.includes('emerald') ? '#10B981' : activeTether.color.includes('blue') ? '#3B82F6' : '#FBBF24';
                        
                        const tetherPath = getSmartPath(sX, sY, tX, tY, activeTether.sourceSide, activeTether.targetSide, 'tether');
                        return <path d={tetherPath} stroke={c} strokeWidth="3" fill="none" strokeDasharray="5,5" className="animate-pulse" />;
                    })()}
                </svg>

                {canvasItems.map(item => (
                  <div key={item.instanceId} onMouseDown={(e) => handleItemPointerDown(e, item)} onMouseUp={() => handleItemPointerUp(item)} onTouchStart={(e) => handleItemPointerDown(e, item)} onTouchEnd={() => handleItemPointerUp(item)}
                    className={`absolute cursor-pointer group transition-transform duration-200 ${isDragging && draggingId === item.instanceId ? 'scale-110 z-[1000]' : 'z-10'} flex items-center justify-center`} 
                    style={{ left: item.x, top: item.y - HEADER_OFFSET, width: 32, height: 32 }}>
                    <div className={`w-[30px] h-[30px] bg-white rounded-md shadow-sm flex items-center justify-center border transition-all 
                      ${item.isOrigin ? 'border-blue-400 ring-1 ring-blue-50 shadow-blue-100' : (item.isRegistered ? 'border-slate-200 shadow-slate-100' : 'border-emerald-300 ring-1 ring-emerald-50 shadow-emerald-50')}
                      ${poweredNodes.has(item.instanceId) ? 'shadow-emerald-200 ring-1 ring-emerald-100' : ''}
                    `}>
                      <SafeIcon name={item.icon} size={16} className={item.isRegistered ? (poweredNodes.has(item.instanceId) ? 'text-slate-800' : 'text-slate-400') : 'text-emerald-500'} />
                    </div>
                    <div className="absolute top-full mt-1 w-full text-center text-[6px] font-black uppercase text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 bg-white/80 px-1 rounded shadow-sm">{item.name}</div>
                  </div>
                ))}

                {/* Segment Balls */}
                {connections.map(conn => {
                    const s = canvasItems.find(i => i.instanceId === conn.sourceId), t = canvasItems.find(i => i.instanceId === conn.targetId);
                    if(!s || !t) return null;
                    const isAdjacent = Math.abs(s.x - t.x) < 35 && Math.abs(s.y - t.y) < 35;
                    if (isAdjacent) return null;

                    const sX = s.x + (conn.sourceSide === 'right' ? 32 : (conn.sourceSide === 'left' ? 0 : 16)), sY = s.y - HEADER_OFFSET + (conn.sourceSide === 'bottom' ? 32 : (conn.sourceSide === 'top' ? 0 : 16));
                    const tX = t.x + (conn.targetSide === 'right' ? 32 : (conn.targetSide === 'left' ? 0 : 16)), tY = t.y - HEADER_OFFSET + (conn.targetSide === 'bottom' ? 32 : (conn.targetSide === 'top' ? 0 : 16));
                    const midX = conn.waypoint ? conn.waypoint.x : (sX + tX) / 2, midY = conn.waypoint ? conn.waypoint.y : (sY + tY) / 2;
                    const c = conn.color.includes('rose') ? 'bg-rose-500' : conn.color.includes('emerald') ? 'bg-emerald-500' : conn.color.includes('blue') ? 'bg-blue-500' : 'bg-amber-400';
                    return (
                        <div key={`ball_${conn.id}`} className={`absolute w-4 h-4 bg-white rounded-full border-2 border-white flex items-center justify-center z-[20] cursor-pointer hover:scale-125 transition-transform shadow-md pointer-events-auto`}
                             style={{ left: midX - 8, top: midY - 8 }} onMouseDown={(e) => { e.stopPropagation(); setWireDragStart({ x: e.clientX, y: e.clientY }); setDraggingWireId(conn.id); }}>
                            <div className={`w-2 h-2 rounded-full ${c} animate-pulse-subtle`} />
                        </div>
                    )
                })}

                {/* Latch points */}
                {canvasItems.map(item => {
                  const involvesRecursion = draggingId && isDescendantOf(item.instanceId, draggingId, connRef.current);
                  return (
                    <div key={`latch_group_${item.instanceId}`} className="absolute pointer-events-none z-[2000]" style={{ left: item.x, top: item.y - HEADER_OFFSET, width: 32, height: 32 }}>
                        {LATCH_POINTS.map(lp => {
                          const ghost = ghostConnections.find(g => g.sourceId === item.instanceId && g.sourceSide === lp.id);
                          const outgoingLink = connections.find(c => c.sourceId === item.instanceId && c.sourceSide === lp.id);
                          const incomingLink = connections.find(c => c.targetId === item.instanceId && c.targetSide === lp.id);
                          
                          // Recursion logic: only 'top' blue is an attachment target
                          const isInvalidRecursionPort = involvesRecursion && lp.id !== 'top';
                          
                          const isVisible = !!ghost || !!outgoingLink || !!incomingLink;
                          const c = lp.color.includes('rose') ? 'bg-rose-500' : lp.color.includes('emerald') ? 'bg-emerald-500' : lp.color.includes('blue') ? 'bg-blue-500' : 'bg-amber-400';
                          
                          return (
                            <div key={lp.id} className={`absolute w-3 h-3 rounded-full transition-all duration-300 border-2 border-white cursor-pointer pointer-events-auto shadow-sm
                                    ${outgoingLink || incomingLink ? c : 'bg-slate-300'}
                                    ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}
                                    ${ghost ? (isInvalidRecursionPort ? 'bg-slate-400 opacity-50' : 'ring-4 ring-slate-200 scale-150 animate-pulse') : ''}
                                    hover:scale-150
                                `} style={{ left: `${lp.x * 100}%`, top: `${lp.y * 100}%`, transform: 'translate(-50%, -50%)' }} 
                            />
                          );
                        })}
                    </div>
                  );
                })}
            </div>
          </div>
        ) : (
          <div className="h-full w-full p-12 max-w-5xl mx-auto overflow-y-auto">
            <h1 className="text-4xl font-black italic uppercase text-slate-800 mb-8">Dashboard</h1>
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                <p className="text-[10px] font-black uppercase text-slate-400">Total Actions</p>
                <p className="text-3xl font-black text-slate-800">{canvasItems.length}</p>
            </div>
          </div>
        )}
      </main>

      <div className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-xs h-24 flex items-end justify-center pb-6 transition-all duration-300 pointer-events-none z-[400] ${isDragging ? 'translate-y-0 opacity-100' : 'translate-y-32 opacity-0'}`}>
        <div className={`p-5 rounded-full transition-all border-2 ${trashActive ? 'bg-rose-500 text-white scale-110 border-rose-400 shadow-2xl' : 'bg-white/80 text-slate-400 border-slate-200'}`}><Trash2 size={24} /></div>
      </div>
      
      <div className="pointer-events-auto">
        <AndroidFolder isMain={true} activeView={activeFolderView} onOpen={setActiveFolderView} onLaunch={handleLauncherNavigate} registry={foldersRegistry} windowSize={windowSize} simulatedOffset={simulatedOffset} />
        <div 
            className="fixed bottom-[40px] left-[40px] w-12 h-12 z-[100] cursor-pointer"
            onMouseDown={handleDrawerPointerDown} onTouchStart={handleDrawerPointerDown}
            onClick={() => dragDistance.current < 10 && (simulatedOffset > 0.5 ? animateTo(0) : animateTo(1))}
        >
            {['actions', 'triggers', 'logic'].map((f, i) => (
                <AndroidFolder key={f} fId={f} index={i} registry={foldersRegistry} activeView={activeFolderView} onOpen={handleOpenFolder} onBirth={handleSmartBirth} windowSize={windowSize} simulatedOffset={simulatedOffset} isStackedItem isDraggingDrawer={isDraggingDrawer} />
            ))}
        </div>
      </div>

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
            <div className="flex gap-4"><button onClick={() => setIsStudioOpen(false)} className="flex-1 py-5 bg-slate-100 text-slate-400 font-black uppercase text-xs rounded-3xl">Cancel</button><button onClick={finalizeActionDNA} className="flex-1 py-5 bg-slate-900 text-white font-black uppercase text-xs rounded-3xl">Initialize</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
