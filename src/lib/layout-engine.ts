
import { CanvasItem, Connection } from './types';
import { GRID_SIZE, HEADER_OFFSET } from './constants';
import { snapToGrid } from './pathing';

/**
 * Universal Unified Flow Engine v14.0 [Strict Lane Integrity & Data Sidecar Alignment]
 */

export interface LayoutResult {
  items: CanvasItem[];
  viewOffset: { x: number; y: number };
}

export function calculateIslandLayout(
  items: CanvasItem[],
  connections: Connection[],
  mode: 'grid' | 'tether',
  windowSize: { w: number, h: number },
  zoom: number
): LayoutResult {
  const newItems = items.map(item => ({ ...item }));
  const visited = new Set<string>();
  const occupied = new Set<string>();
  const getPosKey = (x: number, y: number) => `${Math.round(x)},${Math.round(y)}`;

  const isGrid = mode === 'grid';
  const stepSize = isGrid ? GRID_SIZE : GRID_SIZE * 2;
  const islandGap = GRID_SIZE * (isGrid ? 4 : 8);

  const corridorFloorY = new Map<number, number>(); 
  const laneBreadthX = new Map<number, { min: number, max: number }>(); 

  const updateGlobalSpatialState = (x: number, y: number, isTerminal: boolean) => {
    const corridorX = snapToGrid(x, 0);
    if (isTerminal) {
      corridorFloorY.set(corridorX, Math.max(corridorFloorY.get(corridorX) || 0, y));
    }
    const snapY = snapToGrid(y, HEADER_OFFSET);
    const current = laneBreadthX.get(snapY) || { min: x, max: x };
    laneBreadthX.set(snapY, {
      min: Math.min(current.min, x),
      max: Math.max(current.max, x)
    });
  };

  const findSafePosition = (
    startX: number, 
    startY: number, 
    direction: 'left' | 'right' | 'bottom',
    minX: number = -Infinity,
    maxX: number = Infinity,
    minY: number = -Infinity
  ) => {
    let tx = startX, ty = Math.max(startY, minY);
    
    const corridorX = snapToGrid(tx, 0);
    const floorY = corridorFloorY.get(corridorX) || 0;
    if (!isGrid && ty < floorY + stepSize) {
      ty = floorY + stepSize;
    }

    if (tx < minX) tx = minX;
    if (tx > maxX) tx = maxX;

    let safety = 0;
    while (occupied.has(getPosKey(tx, ty)) && safety < 1000) {
      if (direction === 'bottom') {
        ty += stepSize;
      } else if (direction === 'left') {
        tx -= stepSize;
      } else {
        tx += stepSize;
      }
      if (tx < minX) tx = minX;
      if (tx > maxX) tx = maxX;
      if (ty < minY) ty = minY;
      if (occupied.has(getPosKey(tx, ty))) ty += stepSize;
      safety++;
    }
    return { tx, ty };
  };

  // Grid Mode Fragments on Data/Recursion. Tether Mode Integrates.
  const flowConnections = isGrid 
    ? connections.filter(c => !c.color.includes('fuchsia') && !c.color.includes('blue'))
    : connections.filter(c => !c.color.includes('blue'));

  const triggers = new Set(newItems.filter(i => i.isTrigger || i.isOrigin).map(i => i.instanceId));
  const rootIds = newItems
    .filter(i => triggers.has(i.instanceId) || !connections.some(c => c.targetId === i.instanceId))
    .map(i => i.instanceId);

  // 1. Traverse and Layout Primary Trees
  let currentIslandX = snapToGrid(windowSize.w / 2 - 16, 0);
  const startYBase = snapToGrid(windowSize.h * 0.4, HEADER_OFFSET);

  const sortedRoots = rootIds.map(id => newItems.find(i => i.instanceId === id)!).sort((a, b) => {
    if (a.isOrigin || a.isTrigger) return -1;
    if (b.isOrigin || b.isTrigger) return 1;
    return a.instanceId.localeCompare(b.instanceId);
  });

  const processNode = (nodeId: string, cx: number, cy: number, minX: number, maxX: number, minY: number, islandState: { maxX: number }) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    
    const node = newItems.find(i => i.instanceId === nodeId);
    if (!node) return;

    node.x = cx; 
    node.y = cy; 
    occupied.add(getPosKey(cx, cy));
    islandState.maxX = Math.max(islandState.maxX, cx);
    
    const outgoing = flowConnections.filter(c => c.sourceId === nodeId);
    const isTerminal = outgoing.length === 0;
    updateGlobalSpatialState(cx, cy, isTerminal);

    // Prioritize child layout while maintaining lane boundaries
    const sortedOutgoing = outgoing.sort((a, b) => {
      const order = { 'bottom': 0, 'right': 1, 'left': 2, 'top': 3 };
      return (order[a.sourceSide as keyof typeof order] || 4) - (order[b.sourceSide as keyof typeof order] || 4);
    });

    sortedOutgoing.forEach(conn => {
      if (visited.has(conn.targetId)) return;
      
      let tx = cx, ty = cy;
      let pushDir: 'left' | 'right' | 'bottom' = 'bottom';
      let childMinX = minX, childMaxX = maxX;
      let childMinY = !isGrid ? cy + stepSize : -Infinity;

      if (conn.sourceSide === 'bottom') {
        ty += stepSize;
        pushDir = 'bottom';
      } else if (conn.sourceSide === 'right') {
        tx += stepSize;
        pushDir = 'right';
        if (!isGrid) childMinX = Math.max(minX, cx + stepSize);
      } else if (conn.sourceSide === 'left') {
        tx -= stepSize;
        pushDir = 'left';
        if (!isGrid) childMaxX = Math.min(maxX, cx - stepSize);
      } else if (conn.sourceSide === 'top') {
        ty -= stepSize; // Providers sit above or aligned
        pushDir = 'bottom';
      }

      const { tx: finalX, ty: finalY } = findSafePosition(
        snapToGrid(tx, 0), 
        snapToGrid(ty, HEADER_OFFSET), 
        pushDir,
        childMinX,
        childMaxX,
        childMinY
      );

      processNode(conn.targetId, finalX, finalY, childMinX, childMaxX, childMinY, islandState);
    });
  };

  sortedRoots.forEach((root) => {
    if (!root || visited.has(root.instanceId)) return;
    const islandState = { maxX: currentIslandX };
    processNode(root.instanceId, currentIslandX, startYBase, -Infinity, Infinity, -Infinity, islandState);
    currentIslandX = snapToGrid(islandState.maxX + islandGap, 0);
  });

  // 2. Pack Isolated Items
  const connectedIds = new Set(visited);
  const standalone = newItems.filter(i => !connectedIds.has(i.instanceId));

  let sx = 64, sy = 120;
  standalone.forEach((item, idx) => {
    const standStep = GRID_SIZE * (isGrid ? 1 : 2);
    const { tx, ty } = findSafePosition(
      snapToGrid(sx + (idx % 8) * standStep, 0),
      snapToGrid(sy + Math.floor(idx / 8) * standStep, HEADER_OFFSET),
      'right'
    );
    item.x = tx;
    item.y = ty;
    occupied.add(getPosKey(item.x, item.y));
    visited.add(item.instanceId);
    updateGlobalSpatialState(item.x, item.y, true);
  });

  const origin = newItems.find(i => i.isOrigin) || sortedRoots[0] || standalone[0];
  let targetVX = windowSize.w / 2 - (origin ? (origin.x + 16) : 0) * zoom;
  let targetVY = windowSize.h / 2 - (origin ? (origin.y - HEADER_OFFSET + 16) : 0) * zoom;

  return { items: newItems, viewOffset: { x: targetVX, y: targetVY } };
}
