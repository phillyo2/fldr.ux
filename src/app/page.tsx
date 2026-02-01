
"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Trash2, X } from 'lucide-react';
import { SafeIcon } from '@/components/SafeIcon';
import { AndroidFolder } from '@/components/AndroidFolder';
import { 
  CanvasItem, Connection, FolderData 
} from '@/lib/types';
import { 
  HEADER_OFFSET, LATCH_POINTS, SNAP_TOLERANCE, DETECTION_RANGE, TETHER_DELAY, 
  UNIT_SIZE_VAL, DRAG_THRESHOLD, LONG_PRESS_MS, SELECTABLE_ICONS, DRAG_VISUAL_OFFSET 
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
  const tetherTimer = useRef<NodeJS.Timeout | null>(null);
  const [simulatedOffset, setSimulatedOffset] = useState(0);

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

  const isAncestor = (ancId: string, descId: string): boolean => {
    let curr = descId;
    const visited = new Set<string>();
    while (curr) {
      if (curr === ancId) return true;
      if (visited.has(curr)) break;
      visited.add(curr);
      const incoming = connRef.current.find(c => c.targetId === curr && !c.color.includes('fuchsia'));
      if (!incoming) break;
      curr = incoming.sourceId;
    }
    return false;
  };

  const isExtraInput = (id: string): boolean => {
    return connRef.current.some(c => c.sourceId === id && c.color.includes('fuchsia'));
  };

  const getTreeId = (id: string): string | null => {
    let curr = id;
    const visited = new Set<string>();
    let safety = 0;
    while (curr && safety < 100) {
      if (visited.has(curr)) return null;
      visited.add(curr);
      const node = itemsRef.current.find(i => i.instanceId === curr);
      if (!node) return null;
      if (node.isOrigin) return 'MAIN';
      const incoming = connRef.current.find(c => c.targetId === curr && !c.color.includes('fuchsia'));
      if (!incoming) return null;
      if (incoming.sourceSide === 'left') return curr;
      curr = incoming.sourceId;
      safety++;
    }
    return null;
  };

  const mainNodes = useMemo(() => {
    const main = new Set<string>();
    const origin = canvasItems.find(i => i.isOrigin);
    if (!origin) return main;
    const queue = [origin.instanceId];
    main.add(origin.instanceId);
    let safety = 0;
    while(queue.length > 0 && safety < 1000) {
      const currId = queue.shift()!;
      const outgoing = connections.filter(c => c.sourceId === currId && 
        (c.sourceSide === 'bottom' || c.sourceSide === 'right') &&
        !c.color.includes('fuchsia')
      );
      outgoing.forEach(conn => {
        if (!main.has(conn.targetId)) {
          main.add(conn.targetId);
          queue.push(conn.targetId);
        }
      });
       safety++;
    }
    return main;
  }, [canvasItems, connections]);

  const calculateGhostHandshakes = (items: CanvasItem[], dId: string, dPos: {x: number, y: number} | null = null) => {
    if (activeTether) return [];
    const ghosts: Connection[] = [];
    const dragNode = dPos ? { ...items.find(i => i.instanceId === dId), ...dPos } : items.find(i => i.instanceId === dId);
    if (!dragNode) return ghosts;

    if (isExtraInput(dId)) return [];

    const dragTreeId = getTreeId(dId);

    items.forEach(other => {
      if (other.instanceId === dId) return;
      if (isExtraInput(other.instanceId)) return;

      const otherTreeId = getTreeId(other.instanceId);
      const dx = (dragNode.x || 0) - other.x;
      const dy = (dragNode.y || 0) - other.y;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      
      const isSameTree = (dragTreeId !== null && otherTreeId !== null && dragTreeId === otherTreeId);
      const isUnattachedToCanvas = (otherTreeId !== null && dragTreeId === null);

      if (isSameTree || isUnattachedToCanvas) {
          // Emerald (Success) -> Below
          if (dy > 0 && dy < DETECTION_RANGE && adx < SNAP_TOLERANCE) {
            ghosts.push({ id: 'ghost', sourceId: other.instanceId, sourceSide: 'bottom', targetId: dId, targetSide: 'top', color: 'bg-emerald-500', displayColor: 'bg-emerald-500', snapX: other.x, snapY: other.y + 32, dotDistance: Math.sqrt(adx**2 + (dy-32)**2) } as any);
          } 
          // Rose (Error) -> Right
          else if (dx > 0 && dx < DETECTION_RANGE && ady < SNAP_TOLERANCE) {
            ghosts.push({ id: 'ghost', sourceId: other.instanceId, sourceSide: 'right', targetId: dId, targetSide: 'top', color: 'bg-rose-500', displayColor: 'bg-rose-500', snapX: other.x + 32, snapY: other.y, dotDistance: Math.sqrt((dx-32)**2 + ady**2) } as any);
          } 
          // Amber (Subtree) -> Left (ONLY FOR NEW TILES)
          else if (dx < 0 && Math.abs(dx) < DETECTION_RANGE && ady < SNAP_TOLERANCE) {
            if (dragTreeId === null) {
              ghosts.push({ id: 'ghost', sourceId: other.instanceId, sourceSide: 'left', targetId: dId, targetSide: 'top', color: 'bg-amber-400', displayColor: 'bg-amber-400', snapX: other.x - 32, snapY: other.y, dotDistance: Math.sqrt((Math.abs(dx)-32)**2 + ady**2) } as any);
            }
          }
      }

      // Blue (Go-To Recursion)
      if (isSameTree && isAncestor(other.instanceId, dId)) {
          if (dy < 0 && Math.abs(dy) < DETECTION_RANGE && adx < SNAP_TOLERANCE) {
             ghosts.push({ id: 'ghost', sourceId: dId, sourceSide: 'bottom', targetId: other.instanceId, targetSide: 'top', color: 'bg-blue-500', displayColor: 'bg-blue-500', snapX: other.x, snapY: other.y - 32, dotDistance: Math.sqrt(adx**2 + (Math.abs(dy)-32)**2) } as any);
          }
          else if (dx < 0 && Math.abs(dx) < DETECTION_RANGE && ady < SNAP_TOLERANCE) {
             ghosts.push({ id: 'ghost', sourceId: dId, sourceSide: 'right', targetId: other.instanceId, targetSide: 'top', color: 'bg-blue-500', displayColor: 'bg-blue-500', snapX: other.x - 32, snapY: other.y, dotDistance: Math.sqrt((Math.abs(dx)-32)**2 + ady**2) } as any);
          }
      }

      // Fuchsia (Extra Input / Data Provider) -> Above any tile
      if (isUnattachedToCanvas && dragTreeId === null) {
          if (dy < 0 && Math.abs(dy) < DETECTION_RANGE && adx < SNAP_TOLERANCE) {
            ghosts.push({ id: 'ghost', sourceId: dId, sourceSide: 'bottom', targetId: other.instanceId, targetSide: 'top', color: 'bg-fuchsia-500', displayColor: 'bg-fuchsia-500', snapX: other.x, snapY: other.y - 32, dotDistance: Math.sqrt(adx**2 + (Math.abs(dy)-32)**2) } as any);
          }
      }
    });

    if (ghosts.length === 0) return [];
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
    const start = simulatedOffset; 
    const startTime = performance.now();
    const duration = 100; 
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
        return { ...prev, actions: { ...prev.actions, items: [...prev.actions.items, { ...dna }] } };
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
    mouseOffset.current = { x: clientX - item.x, y: clientY - item.y + DRAG_VISUAL_OFFSET };
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

  const deleteConnection = (e: React.MouseEvent | React.TouchEvent, connId: string) => {
    e.stopPropagation();
    setConnections(prev => prev.filter(c => c.id !== connId));
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
        setViewOffset({ x: panOffsetStart.current.x + (clientX - panStart.current.x), y: panOffsetStart.current.y + (clientY - panStart.current.y) });
        return;
      }

      const x = clientX - mouseOffset.current.x; const y = clientY - mouseOffset.current.y;
      setCanvasItems(prev => prev.map(i => i.instanceId === draggingId ? { ...i, x, y } : i));
      
      const ghosts = calculateGhostHandshakes(itemsRef.current, draggingId!, { x, y });
      setGhostConnections(ghosts);

      if (!activeTether) {
          const best = ghosts[0] as any;
          if (best && best.dotDistance < SNAP_TOLERANCE) {
              if (!tetherTimer.current) {
                  tetherTimer.current = setTimeout(() => {
                      if(best) { setActiveTether({ ...best }); setGhostConnections([]); }
                  }, TETHER_DELAY);
              }
          } else { 
              if (tetherTimer.current) { clearTimeout(tetherTimer.current); tetherTimer.current = null; } 
          }
      } 
      setTrashActive(clientY > window.innerHeight - 100);
    };

    const handleUp = (e: MouseEvent | TouchEvent) => {
      setDragStartPos(null); if (pressTimer.current) clearTimeout(pressTimer.current);
      if (isPanning) { setViewOffset(prev => ({ x: snapToGrid(prev.x, 0), y: snapToGrid(prev.y, 0) })); setIsPanning(false); return; }
      if (tetherTimer.current) { clearTimeout(tetherTimer.current); tetherTimer.current = null; }
      if (!isDragging) return; 

      const droppedItem = itemsRef.current.find(i => i.instanceId === draggingId);
      if (!droppedItem) return; 
      
      setCanvasItems(prev => {
        const item = prev.find(i => i.instanceId === draggingId);
        if (!item) return prev;
        let finalX = snapToGrid(item.x, 0); let finalY = snapToGrid(item.y, HEADER_OFFSET);
        
        const ghosts = calculateGhostHandshakes(itemsRef.current, draggingId!, { x: item.x, y: item.y });
        const best = ghosts[0] as any;
        if (best && best.dotDistance < SNAP_TOLERANCE) { finalX = best.snapX!; finalY = best.snapY!; }

        const isOccupied = prev.some(other => other.instanceId !== draggingId && Math.abs(other.x - finalX) < 5 && Math.abs(other.y - finalY) < 5);
        if (isOccupied) return prev.map(i => i.instanceId === draggingId ? { ...i, x: lastValidPos.current.x, y: lastValidPos.current.y } : i);
        return prev.map(i => i.instanceId === draggingId ? { ...i, x: finalX, y: finalY } : i);
      });

      if (activeTether) { setConnections(prev => [...prev, { ...activeTether, id: `conn_${Date.now()}` }]); } 
      setActiveTether(null); setGhostConnections([]); setIsDragging(false); setDraggingId(null); setTrashActive(false);
    };
    window.addEventListener('mousemove', handleMove); window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove); window.addEventListener('touchmove', handleMove); window.addEventListener('touchend', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); window.removeEventListener('touchmove', handleMove); window.removeEventListener('touchend', handleUp); };
  }, [isDragging, isPanning, draggingId, activeTether, dragStartPos, viewOffset]); 

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
                    {connections.map(conn => {
                        const s = canvasItems.find(i => i.instanceId === conn.sourceId), t = canvasItems.find(i => i.instanceId === conn.targetId);
                        if(!s || !t) return null;
                        
                        // Fusion Logic: Hide line when flush at connection side (EXCEPT FOR RECURSION)
                        const isRecursive = conn.color.includes('blue');
                        const isAdjacent = !isRecursive && (
                           (conn.sourceSide === 'bottom' && s.x === t.x && s.y === t.y - 32) ||
                           (conn.sourceSide === 'right' && s.x === t.x - 32 && s.y === t.y) ||
                           (conn.sourceSide === 'left' && s.x === t.x + 32 && s.y === t.y)
                        );

                        if (isAdjacent) return null;

                        const sX = s.x + (conn.sourceSide === 'right' ? 32 : (conn.sourceSide === 'left' ? 0 : 16)), sY = s.y - HEADER_OFFSET + (conn.sourceSide === 'bottom' ? 32 : (conn.sourceSide === 'top' ? 0 : 16));
                        const tX = t.x + (conn.targetSide === 'right' ? 32 : (conn.targetSide === 'left' ? 0 : 16)), tY = t.y - HEADER_OFFSET + (conn.targetSide === 'bottom' ? 32 : (conn.targetSide === 'top' ? 0 : 16));
                        const pathData = getSmartPath(sX, sY, tX, tY, conn.sourceSide, conn.targetSide, conn.sourceId, conn.targetId, canvasItems);
                        const c = conn.color.includes('rose') ? '#F43F5E' : 
                                  conn.color.includes('emerald') ? '#10B981' : 
                                  conn.color.includes('blue') ? '#3B82F6' : 
                                  conn.color.includes('fuchsia') ? '#D946EF' : '#FBBF24';
                        return <path key={conn.id} d={pathData.d} stroke={c} strokeWidth="3" fill="none" strokeLinecap="round" className="drop-shadow-sm" />;
                    })}
                    
                    {activeTether && (() => {
                        const s = canvasItems.find(i => i.instanceId === activeTether.sourceId), t = canvasItems.find(i => i.instanceId === activeTether.targetId);
                        if (!s || !t) return null;

                        const isRecursive = activeTether.color.includes('blue');
                        const isAdjacent = !isRecursive && (
                           (activeTether.sourceSide === 'bottom' && s.x === t.x && s.y === t.y - 32) ||
                           (activeTether.sourceSide === 'right' && s.x === t.x - 32 && s.y === t.y) ||
                           (activeTether.sourceSide === 'left' && s.x === t.x + 32 && s.y === t.y)
                        );

                        if (isAdjacent) return null;

                        const sX = s.x + (activeTether.sourceSide === 'right' ? 32 : (activeTether.sourceSide === 'left' ? 0 : 16)), sY = s.y - HEADER_OFFSET + (activeTether.sourceSide === 'bottom' ? 32 : (activeTether.sourceSide === 'top' ? 0 : 16));
                        const tX = t.x + (activeTether.targetSide === 'right' ? 32 : (activeTether.targetSide === 'left' ? 0 : 16)), tY = t.y - HEADER_OFFSET + (activeTether.targetSide === 'bottom' ? 32 : (activeTether.targetSide === 'top' ? 0 : 16));
                        const c = activeTether.color.includes('rose') ? '#F43F5E' : 
                                  activeTether.color.includes('emerald') ? '#10B981' : 
                                  activeTether.color.includes('blue') ? '#3B82F6' : 
                                  activeTether.color.includes('fuchsia') ? '#D946EF' : '#FBBF24';
                        const tetherPath = getSmartPath(sX, sY, tX, tY, activeTether.sourceSide, activeTether.targetSide, activeTether.sourceId, activeTether.targetId, canvasItems);
                        return <path d={tetherPath.d} stroke={c} strokeWidth="3" fill="none" strokeDasharray="5,5" className="animate-pulse" />;
                    })()}
                </svg>

                {canvasItems.map(item => (
                  <div key={item.instanceId} onMouseDown={(e) => handleItemPointerDown(e, item)} onMouseUp={() => handleItemPointerUp(item)} onTouchStart={(e) => handleItemPointerDown(e, item)} onTouchEnd={() => handleItemPointerUp(item)}
                    className={`absolute cursor-pointer group transition-transform duration-200 ${isDragging && draggingId === item.instanceId ? 'scale-110 z-[1000]' : 'z-10'} flex items-center justify-center`} 
                    style={{ left: item.x, top: item.y - HEADER_OFFSET, width: 32, height: 32 }}>
                    <div className={`w-[30px] h-[30px] bg-white rounded-md shadow-sm flex items-center justify-center border transition-all 
                      ${item.isOrigin ? 'border-blue-400 ring-1 ring-blue-50 shadow-blue-100' : (item.isRegistered ? 'border-slate-200 shadow-slate-100' : 'border-emerald-300 ring-1 ring-emerald-50 shadow-emerald-50')}
                      ${mainNodes.has(item.instanceId) ? 'shadow-emerald-200 ring-1 ring-emerald-100' : ''}
                      ${isExtraInput(item.instanceId) ? 'border-fuchsia-400 ring-1 ring-fuchsia-50 shadow-fuchsia-100' : ''}
                    `}>
                      <SafeIcon name={item.icon} size={16} className={item.isRegistered ? (mainNodes.has(item.instanceId) ? 'text-slate-800' : 'text-slate-400') : 'text-emerald-500'} />
                    </div>
                    <div className="absolute top-full mt-1 w-full text-center text-[6px] font-black uppercase text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 bg-white/80 px-1 rounded shadow-sm">{item.name}</div>
                  </div>
                ))}

                {connections.map(conn => {
                    const s = canvasItems.find(i => i.instanceId === conn.sourceId), t = canvasItems.find(i => i.instanceId === conn.targetId);
                    if(!s || !t) return null;
                    
                    const isRecursive = conn.color.includes('blue');
                    const isAdjacent = !isRecursive && (
                       (conn.sourceSide === 'bottom' && s.x === t.x && s.y === t.y - 32) ||
                       (conn.sourceSide === 'right' && s.x === t.x - 32 && s.y === t.y) ||
                       (conn.sourceSide === 'left' && s.x === t.x + 32 && s.y === t.y)
                    );

                    if (isAdjacent) return null;

                    const sX = s.x + (conn.sourceSide === 'right' ? 32 : (conn.sourceSide === 'left' ? 0 : 16)), sY = s.y - HEADER_OFFSET + (conn.sourceSide === 'bottom' ? 32 : (conn.sourceSide === 'top' ? 0 : 16));
                    const tX = t.x + (conn.targetSide === 'right' ? 32 : (conn.targetSide === 'left' ? 0 : 16)), tY = t.y - HEADER_OFFSET + (conn.targetSide === 'bottom' ? 32 : (conn.targetSide === 'top' ? 0 : 16));
                    const pathData = getSmartPath(sX, sY, tX, tY, conn.sourceSide, conn.targetSide, conn.sourceId, conn.targetId, canvasItems);
                    const c = conn.color.includes('rose') ? 'bg-rose-500' : 
                               conn.color.includes('emerald') ? 'bg-emerald-500' : 
                               conn.color.includes('blue') ? 'bg-blue-500' : 
                               conn.color.includes('fuchsia') ? 'bg-fuchsia-500' : 'bg-amber-400';
                    return (
                        <div 
                          key={`ball_${conn.id}`} 
                          onClick={(e) => deleteConnection(e, conn.id)}
                          onTouchStart={(e) => deleteConnection(e, conn.id)}
                          className={`absolute w-4 h-4 bg-white rounded-full border-2 border-white flex items-center justify-center z-[20] shadow-md cursor-pointer pointer-events-auto hover:scale-125 transition-transform group`}
                          style={{ left: pathData.mid.x - 8, top: pathData.mid.y - 8 }}>
                            <div className={`w-2 h-2 rounded-full ${c} animate-pulse-subtle group-hover:hidden`} />
                            <X className="w-2 h-2 text-slate-400 hidden group-hover:block" />
                        </div>
                    )
                })}

                {/* PASS 1: Child Ports (Inputs - Blue) - Hides on fusion (EXCEPT RECURSION) */}
                {canvasItems.map(item => (
                    <div key={`latch_inputs_${item.instanceId}`} className={`absolute pointer-events-none ${draggingId === item.instanceId ? 'z-[1001]' : 'z-20'}`} style={{ left: item.x, top: item.y - HEADER_OFFSET, width: 32, height: 32 }}>
                        {LATCH_POINTS.filter(lp => lp.type === 'input').map(lp => {
                          const ghost = ghostConnections.find(g => g.targetId === item.instanceId && g.targetSide === lp.id);
                          const incomingLink = connections.find(c => c.targetId === item.instanceId && c.targetSide === lp.id);
                          
                          const s = incomingLink ? canvasItems.find(i => i.instanceId === incomingLink.sourceId) : null;
                          const t = item;
                          
                          const isRecursive = incomingLink?.color.includes('blue');
                          const isFused = !isRecursive && s && (
                             (incomingLink?.sourceSide === 'bottom' && s.x === t.x && s.y === t.y - 32) ||
                             (incomingLink?.sourceSide === 'right' && s.x === t.x - 32 && s.y === t.y) ||
                             (incomingLink?.sourceSide === 'left' && s.x === t.x + 32 && s.y === t.y)
                          );

                          const isConnected = !!incomingLink;
                          const isGuidance = !!ghost || activeTether?.targetId === item.instanceId;
                          // Input dot disappears if fused (non-recursive)
                          const isVisible = (isGuidance || isConnected) && !isFused;
                          const c = isRecursive ? 'bg-blue-500' : (lp.color.includes('blue') ? 'bg-blue-500' : 'bg-slate-300');
                          return (
                            <div key={lp.id} className={`absolute w-3 h-3 rounded-full transition-all duration-300 border-2 border-white pointer-events-none shadow-sm z-[2000]
                                    ${isConnected ? c : 'bg-slate-300'}
                                    ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}
                                    ${ghost ? 'ring-4 ring-slate-200 scale-150 animate-pulse' : ''}
                                `} style={{ left: `${lp.x * 100}%`, top: `${lp.y * 100}%`, transform: 'translate(-50%, -50%)' }} 
                            />
                          );
                        })}
                    </div>
                ))}

                {/* PASS 2: Parent Ports (Outputs - Green, Red, Yellow, Fuchsia) - Always stays visible if active */}
                {canvasItems.map(item => (
                    <div key={`latch_parents_${item.instanceId}`} className={`absolute pointer-events-none ${draggingId === item.instanceId ? 'z-[1002]' : 'z-21'}`} style={{ left: item.x, top: item.y - HEADER_OFFSET, width: 32, height: 32 }}>
                        {LATCH_POINTS.filter(lp => lp.type !== 'input').map(lp => {
                          const ghost = ghostConnections.find(g => g.sourceId === item.instanceId && g.sourceSide === lp.id);
                          const outgoingLink = connections.find(c => c.sourceId === item.instanceId && c.sourceSide === lp.id);
                          
                          const isConnected = !!outgoingLink;
                          const isGuidance = !!ghost || activeTether?.sourceId === item.instanceId;
                          // Parent dots ALWAYS stay visible if connected or guidance exists
                          const isVisible = (isGuidance || isConnected);
                          
                          // Dynamic color based on actual connection or ghost status
                          const activeColor = outgoingLink ? outgoingLink.color : (ghost ? ghost.color : lp.color);
                          const c = activeColor.includes('rose') ? 'bg-rose-500' : 
                                    activeColor.includes('emerald') ? 'bg-emerald-500' : 
                                    activeColor.includes('fuchsia') ? 'bg-fuchsia-500' : 
                                    activeColor.includes('blue') ? 'bg-blue-500' : 'bg-amber-400';

                          return (
                            <div key={lp.id} className={`absolute w-3 h-3 rounded-full transition-all duration-300 border-2 border-white pointer-events-none shadow-sm z-[2001]
                                    ${isConnected ? c : 'bg-slate-300'}
                                    ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}
                                    ${ghost ? 'ring-4 ring-slate-200 scale-150 animate-pulse' : ''}
                                `} style={{ left: `${lp.x * 100}%`, top: `${lp.y * 100}%`, transform: 'translate(-50%, -50%)' }} 
                            />
                          );
                        })}
                    </div>
                ))}
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

      <div className="pointer-events-auto">
        <AndroidFolder isMain={true} activeView={activeFolderView} onOpen={setActiveFolderView} onLaunch={(id) => { setCurrentPageId(id); animateTo(0); }} registry={foldersRegistry} windowSize={windowSize} simulatedOffset={simulatedOffset} />
        <div className="fixed bottom-[40px] left-[40px] w-12 h-12 z-[100] cursor-pointer">
            {['actions', 'triggers', 'logic'].map((f, i) => (
                <AndroidFolder key={f} fId={f} index={i} registry={foldersRegistry} activeView={activeFolderView} onOpen={setActiveFolderView} onBirth={handleSmartBirth} windowSize={windowSize} simulatedOffset={simulatedOffset} isStackedItem />
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
