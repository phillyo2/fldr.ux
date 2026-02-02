
import { CanvasItem, Connection } from './types';
import { GRID_SIZE, HEADER_OFFSET } from './constants';
import { snapToGrid } from './pathing';

/**
 * Universal Unified Flow Engine v18.0 [Sidecar Boundary & Centrifugal Lane Integrity]
 * 
 * - Sidecars (Fuchsia) now actively push subtree boundaries to the right.
 * - Red Subtree Lane Integrity handles horizontal corridor isolation.
 * - Emerald Subflows maintain vertical spine clearance.
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

  // Tracking for "Down and Out" Waterfall enforcement
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
    minY: number = -Infinity,
    hasSidecar: boolean = false
  ) => {
    let tx = startX, ty = Math.max(startY, minY);
    
    const corridorX = snapToGrid(tx, 0);
    const floorY = corridorFloorY.get(corridorX) || 0;
    
    // In Tether mode, enforce waterfall clearance
    if (!isGrid && ty < floorY + stepSize) {
      ty = floorY + stepSize;
    }

    // Apply strict lane boundaries
    if (tx < minX) tx = minX;
    if (tx > maxX) tx = maxX;

    let safety = 0;
    const isOccupied = (x: number, y: number) => {
      if (occupied.has(getPosKey(x, y))) return true;
      if (hasSidecar && occupied.has(getPosKey(x - stepSize / 2, y - stepSize / 2))) return true;
      return false;
    };

    while (isOccupied(tx, ty) && safety < 1000) {
      if (direction === 'bottom') {
        ty += stepSize;
      } else if (direction === 'left') {
        tx -= stepSize;
      } else {
        tx += stepSize;
      }
      
      // Re-enforce boundaries after push
      if (tx < minX) tx = minX;
      if (tx > maxX) tx = maxX;
      if (ty < minY) ty = minY;
      
      // Secondary safety check for vertical overlap
      if (isOccupied(tx, ty)) ty += stepSize;
      safety++;
    }
    return { tx, ty };
  };

  // Connection Filtering
  const flowConnections = isGrid 
    ? connections.filter(c => !c.color.includes('fuchsia') && !c.color.includes('blue'))
    : connections.filter(c => !c.color.includes('blue'));

  const triggers = new Set(newItems.filter(i => i.isTrigger || i.isOrigin).map(i => i.instanceId));
  const rootIds = newItems
    .filter(i => triggers.has(i.instanceId) || !connections.some(c => c.targetId === i.instanceId))
    .map(i => i.instanceId);

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

    // Tether Mode Sidecar Integration (Fuchsia)
    const hasCurrentSidecar = !isGrid && connections.some(c => c.targetId === nodeId && c.color.includes('fuchsia'));
    if (!isGrid) {
      const dataProviders = connections.filter(c => c.targetId === nodeId && c.color.includes('fuchsia'));
      dataProviders.forEach(conn => {
        const provider = newItems.find(i => i.instanceId === conn.sourceId);
        if (provider && !visited.has(provider.instanceId)) {
          visited.add(provider.instanceId);
          provider.x = cx - (stepSize / 2);
          provider.y = cy - (stepSize / 2);
          occupied.add(getPosKey(provider.x, provider.y));
          islandState.maxX = Math.max(islandState.maxX, provider.x);
        }
      });
    }

    node.x = cx; 
    node.y = cy; 
    occupied.add(getPosKey(cx, cy));
    islandState.maxX = Math.max(islandState.maxX, cx);
    
    const outgoing = flowConnections.filter(c => c.sourceId === nodeId);
    const isTerminal = outgoing.length === 0;
    updateGlobalSpatialState(cx, cy, isTerminal);

    // Sort to prioritize Emerald (Bottom) then Rose (Right/Red)
    const sortedOutgoing = outgoing.sort((a, b) => {
      const order = { 'bottom': 0, 'right': 1, 'left': 2, 'top': 3 };
      return (order[a.sourceSide as keyof typeof order] || 4) - (order[b.sourceSide as keyof typeof order] || 4);
    });

    sortedOutgoing.forEach(conn => {
      if (visited.has(conn.targetId)) return;
      
      let tx = cx, ty = cy;
      let pushDir: 'left' | 'right' | 'bottom' = 'bottom';
      
      // Sidecar Boundary Persistence: If parent has a sidecar, push children further to the right
      // to avoid subtree logic wrapping back under the data provider.
      const boundaryPush = hasCurrentSidecar ? (stepSize / 2) : 0;
      let childMinX = minX + boundaryPush;
      let childMaxX = maxX;
      let childMinY = !isGrid ? cy + stepSize : -Infinity;

      if (conn.sourceSide === 'bottom') {
        ty += stepSize;
        pushDir = 'bottom';
      } else if (conn.sourceSide === 'right') {
        tx += stepSize;
        pushDir = 'right';
        // Red Subtree Lane Integrity: Lock to right lane to clear room for left subflows
        if (!isGrid) {
          childMinX = Math.max(childMinX, cx + stepSize);
        }
      } else if (conn.sourceSide === 'left') {
        tx -= stepSize;
        pushDir = 'left';
        if (!isGrid) childMaxX = Math.min(maxX, cx - stepSize);
      } else if (conn.sourceSide === 'top') {
        ty -= stepSize;
        pushDir = 'bottom';
      }

      // Proactive Sidecar detection for the target node
      const hasTargetSidecar = !isGrid && connections.some(c => c.targetId === conn.targetId && c.color.includes('fuchsia'));

      const { tx: finalX, ty: finalY } = findSafePosition(
        snapToGrid(tx, 0), 
        snapToGrid(ty, HEADER_OFFSET), 
        pushDir,
        childMinX,
        childMaxX,
        childMinY,
        hasTargetSidecar
      );

      processNode(conn.targetId, finalX, finalY, childMinX, childMaxX, childMinY, islandState);
    });
  };

  // Traversal Loop
  let currentIslandX = snapToGrid(windowSize.w / 2 - 16, 0);
  const startYBase = snapToGrid(windowSize.h * 0.4, HEADER_OFFSET);

  sortedRoots.forEach((root) => {
    if (!root || visited.has(root.instanceId)) return;
    const islandState = { maxX: currentIslandX };
    processNode(root.instanceId, currentIslandX, startYBase, -Infinity, Infinity, -Infinity, islandState);
    currentIslandX = snapToGrid(islandState.maxX + islandGap, 0);
  });

  // Isolated Pack for Standalone Nodes
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
  });

  const origin = newItems.find(i => i.isOrigin) || sortedRoots[0] || standalone[0];
  let targetVX = windowSize.w / 2 - (origin ? (origin.x + 16) : 0) * zoom;
  let targetVY = windowSize.h / 2 - (origin ? (origin.y - HEADER_OFFSET + 16) : 0) * zoom;

  return { items: newItems, viewOffset: { x: targetVX, y: targetVY } };
}
