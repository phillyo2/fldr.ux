
import { CanvasItem, Connection } from './types';
import { GRID_SIZE, HEADER_OFFSET } from './constants';
import { snapToGrid } from './pathing';

/**
 * Island Gathering Engine v8.0 [Horizontal & Vertical Isolation]
 * Pure logic for Crossword (Adjacent) and Tether (Spaced) layout organization.
 * 
 * Rules:
 * 1. Data (Fuchsia) and Recursive (Blue) isolation occurs in Grid mode for fragmentation.
 * 2. In Tether mode, all connections are part of a unified flow but respect directional gates.
 * 3. Yellow (Left) establishes a vertical slice: descendants stay LEFT of parent X.
 * 4. Red (Right) establishes a vertical slice: descendants stay RIGHT of parent X.
 * 5. Horizontal Slice: Every descendant establishes a Y-boundary; children stay BELOW parent Y.
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

  const stepSize = mode === 'grid' ? GRID_SIZE : GRID_SIZE * 2;
  const islandGap = GRID_SIZE * (mode === 'grid' ? 4 : 6);

  /**
   * Directional Occupancy & Boundary Adjustment
   * Respects both Vertical Lane (X) and Horizontal Slice (Y) boundaries.
   */
  const findSafePosition = (
    startX: number, 
    startY: number, 
    direction: 'left' | 'right' | 'bottom',
    minX: number = -Infinity,
    maxX: number = Infinity,
    minY: number = -Infinity
  ) => {
    let tx = startX, ty = Math.max(startY, minY);
    let safety = 0;
    while (occupied.has(getPosKey(tx, ty)) && safety < 1000) {
      if (direction === 'bottom') {
        ty += stepSize;
      } else if (direction === 'left') {
        tx -= stepSize;
      } else {
        tx += stepSize;
      }
      
      // Enforce hard lane boundaries
      if (tx < minX) tx = minX;
      if (tx > maxX) tx = maxX;
      
      // Enforce horizontal slice boundary
      if (ty < minY) ty = minY;
      
      // If we hit a boundary but it's still occupied, we must go down
      if (occupied.has(getPosKey(tx, ty))) {
        ty += stepSize;
      }
      safety++;
    }
    return { tx, ty };
  };

  // Rule 1: Fragmentation logic for Grid View isolation
  const flowConnections = mode === 'grid' 
    ? connections.filter(c => !c.color.includes('fuchsia') && !c.color.includes('blue'))
    : connections;

  const triggers = new Set(newItems.filter(i => i.isTrigger || i.isOrigin).map(i => i.instanceId));
  const fragmentationTargets = mode === 'grid' 
    ? new Set(connections.filter(c => c.color.includes('fuchsia') || c.color.includes('blue')).map(c => c.targetId))
    : new Set();
  
  const incomingFlowTargets = new Set(flowConnections.map(c => c.targetId));
  const rootIds = newItems
    .filter(i => triggers.has(i.instanceId) || fragmentationTargets.has(i.instanceId) || !incomingFlowTargets.has(i.instanceId))
    .map(i => i.instanceId);

  // 1. Standalone Pack (Top-Left High Density)
  const connectedIds = new Set([
    ...connections.map(c => c.sourceId),
    ...connections.map(c => c.targetId)
  ]);
  const standalone = newItems.filter(i => !connectedIds.has(i.instanceId) && !i.isTrigger && !i.isOrigin);

  let sx = 64, sy = 120;
  standalone.forEach((item, idx) => {
    const standStep = GRID_SIZE * (mode === 'grid' ? 1 : 2);
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

  // 2. Sequential Lane-Isolated Island Layout
  let currentLaneStartX = snapToGrid(windowSize.w / 2 - 16, 0);
  const startY = snapToGrid(windowSize.h * 0.4, HEADER_OFFSET);

  const sortedRoots = rootIds.map(id => newItems.find(i => i.instanceId === id)!).sort((a, b) => {
    if (a.isOrigin || a.isTrigger) return -1;
    if (b.isOrigin || b.isTrigger) return 1;
    return a.instanceId.localeCompare(b.instanceId);
  });

  sortedRoots.forEach((root) => {
    if (!root || visited.has(root.instanceId)) return;
    
    let islandMaxX = currentLaneStartX;

    const processNode = (nodeId: string, cx: number, cy: number, minX: number, maxX: number, minY: number) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      const node = newItems.find(i => i.instanceId === nodeId);
      if (node) { 
        node.x = cx; 
        node.y = cy; 
        occupied.add(getPosKey(cx, cy));
        islandMaxX = Math.max(islandMaxX, cx);
      }

      const outgoing = flowConnections.filter(c => c.sourceId === nodeId);
      outgoing.forEach(conn => {
        if (visited.has(conn.targetId)) return;
        
        let tx = cx, ty = cy;
        let pushDir: 'left' | 'right' | 'bottom' = 'bottom';
        let childMinX = minX;
        let childMaxX = maxX;
        
        // The "Horizontal Slice" - children can never go above parent in tether mode
        let childMinY = mode === 'tether' ? cy + stepSize : -Infinity;

        if (conn.sourceSide === 'bottom') {
          ty += stepSize;
          pushDir = 'bottom';
        } else if (conn.sourceSide === 'right') {
          tx += stepSize;
          pushDir = 'right';
          // Start a rightward lane: descendants must stay right of this vertical slice
          childMinX = Math.max(minX, cx + (mode === 'grid' ? stepSize : stepSize / 2));
        } else if (conn.sourceSide === 'left') {
          tx -= stepSize;
          pushDir = 'left';
          // Start a leftward lane: descendants must stay left of this vertical slice
          childMaxX = Math.min(maxX, cx - (mode === 'grid' ? stepSize : stepSize / 2));
        }

        const { tx: finalX, ty: finalY } = findSafePosition(
          snapToGrid(tx, 0), 
          snapToGrid(ty, HEADER_OFFSET), 
          pushDir,
          childMinX,
          childMaxX,
          childMinY
        );
        processNode(conn.targetId, finalX, finalY, childMinX, childMaxX, childMinY);
      });
    };

    // Initialize root in its exclusive corridor
    processNode(root.instanceId, currentLaneStartX, startY, -Infinity, Infinity, -Infinity);
    
    // Push the next island beyond the bounds of this logical tree
    currentLaneStartX = snapToGrid(islandMaxX + islandGap, 0);
  });

  // Center camera on primary origin
  const origin = newItems.find(i => i.isOrigin) || sortedRoots[0] || standalone[0];
  let targetVX = windowSize.w / 2 - (origin ? (origin.x + 16) : 0) * zoom;
  let targetVY = windowSize.h / 2 - (origin ? (origin.y - HEADER_OFFSET + 16) : 0) * zoom;

  return { items: newItems, viewOffset: { x: targetVX, y: targetVY } };
}
