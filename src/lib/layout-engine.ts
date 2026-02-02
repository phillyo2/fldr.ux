
import { CanvasItem, Connection } from './types';
import { GRID_SIZE, HEADER_OFFSET } from './constants';
import { snapToGrid } from './pathing';

/**
 * Island Gathering Engine v10.0 [Waterfall & Lane Isolation]
 * Pure logic for Crossword (Adjacent) and Tether (Spaced) layout organization.
 * 
 * Rules:
 * 1. Data (Fuchsia) and Recursive (Blue) isolation occurs only in Grid mode.
 * 2. In Tether mode, all connections are part of a unified flow but respect directional corridors.
 * 3. Vertical Corridor Isolation: Yellow (Left) stays left of parent X. Red (Right) stays right.
 * 4. Horizontal Slice Isolation: Descendants always stay below parent Y.
 * 5. Terminal Waterfall: Terminal nodes of ancestors establish a horizontal slice that 
 *    descendant subtrees/islands must respect, forcing them downward.
 * 6. Outward Enforcement: Subtrees push siblings further outward horizontally to maintain lane integrity.
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
  const islandGap = GRID_SIZE * (mode === 'grid' ? 4 : 8);

  // Track global maximum Y per horizontal "zone" to enforce waterfall slices
  const zoneMaxY = new Map<number, number>(); // snapToGrid(x) -> maxY

  const updateZoneY = (x: number, y: number) => {
    const k = snapToGrid(x, 0);
    zoneMaxY.set(k, Math.max(zoneMaxY.get(k) || 0, y));
  };

  /**
   * Directional Occupancy & Boundary Adjustment
   * Respects Vertical Lane (X), Horizontal Slice (Y), and Waterfall (maxY) boundaries.
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
    
    // Enforce Waterfall: Check if this vertical corridor has an ancestor terminal node "floor"
    const zoneY = zoneMaxY.get(snapToGrid(tx, 0)) || 0;
    if (mode === 'tether' && ty < zoneY + stepSize) {
      ty = zoneY + stepSize;
    }

    let safety = 0;
    // Enforce hard lane boundaries
    if (tx < minX) tx = minX;
    if (tx > maxX) tx = maxX;

    while (occupied.has(getPosKey(tx, ty)) && safety < 1000) {
      if (direction === 'bottom') {
        ty += stepSize;
      } else if (direction === 'left') {
        tx -= stepSize;
      } else {
        tx += stepSize;
      }
      
      // Enforce boundaries
      if (tx < minX) tx = minX;
      if (tx > maxX) tx = maxX;
      if (ty < minY) ty = minY;
      
      // If we hit a boundary but it's still occupied, we must go down
      if (occupied.has(getPosKey(tx, ty))) {
        ty += stepSize;
      }
      safety++;
    }
    return { tx, ty };
  };

  // Fragmentation logic for Grid View isolation (only in Grid mode)
  const isGrid = mode === 'grid';
  const flowConnections = isGrid 
    ? connections.filter(c => !c.color.includes('fuchsia') && !c.color.includes('blue'))
    : connections;

  const triggers = new Set(newItems.filter(i => i.isTrigger || i.isOrigin).map(i => i.instanceId));
  const rootIds = newItems
    .filter(i => triggers.has(i.instanceId) || !connections.some(c => c.targetId === i.instanceId))
    .map(i => i.instanceId);

  // 1. Standalone Pack (Top-Left High Density)
  const connectedIds = new Set([
    ...connections.map(c => c.sourceId),
    ...connections.map(c => c.targetId)
  ]);
  const standalone = newItems.filter(i => !connectedIds.has(i.instanceId) && !i.isTrigger && !i.isOrigin);

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
    updateZoneY(item.x, item.y);
  });

  // 2. Sequential Lane-Isolated Waterfall Layout
  let currentIslandX = snapToGrid(windowSize.w / 2 - 16, 0);
  const startYBase = snapToGrid(windowSize.h * 0.4, HEADER_OFFSET);

  const sortedRoots = rootIds.map(id => newItems.find(i => i.instanceId === id)!).sort((a, b) => {
    if (a.isOrigin || a.isTrigger) return -1;
    if (b.isOrigin || b.isTrigger) return 1;
    return a.instanceId.localeCompare(b.instanceId);
  });

  sortedRoots.forEach((root) => {
    if (!root || visited.has(root.instanceId)) return;
    
    let islandMaxX = currentIslandX;

    const processNode = (nodeId: string, cx: number, cy: number, minX: number, maxX: number, minY: number) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      const node = newItems.find(i => i.instanceId === nodeId);
      if (node) { 
        node.x = cx; 
        node.y = cy; 
        occupied.add(getPosKey(cx, cy));
        islandMaxX = Math.max(islandMaxX, cx);
        updateZoneY(cx, cy);
      }

      const outgoing = flowConnections.filter(c => c.sourceId === nodeId);
      
      // If node is terminal, ensure it updates the corridor's waterfall slice
      if (outgoing.length === 0 && mode === 'tether') {
        updateZoneY(cx, cy);
      }

      const sortedOutgoing = outgoing.sort((a, b) => {
        const order = { 'bottom': 0, 'right': 1, 'left': 2 };
        return (order[a.sourceSide as keyof typeof order] || 3) - (order[b.sourceSide as keyof typeof order] || 3);
      });

      sortedOutgoing.forEach(conn => {
        if (visited.has(conn.targetId)) return;
        
        let tx = cx, ty = cy;
        let pushDir: 'left' | 'right' | 'bottom' = 'bottom';
        let childMinX = minX;
        let childMaxX = maxX;
        let childMinY = !isGrid ? cy + stepSize : -Infinity;

        if (conn.sourceSide === 'bottom') {
          ty += stepSize;
          pushDir = 'bottom';
        } else if (conn.sourceSide === 'right') {
          tx += stepSize;
          pushDir = 'right';
          childMinX = Math.max(minX, cx + stepSize);
        } else if (conn.sourceSide === 'left') {
          tx -= stepSize;
          pushDir = 'left';
          childMaxX = Math.min(maxX, cx - stepSize);
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

    // Initialize island in its exclusive waterfall corridor
    processNode(root.instanceId, currentIslandX, startYBase, -Infinity, Infinity, -Infinity);
    
    // Push the next island beyond the bounds of this logical tree
    currentIslandX = snapToGrid(islandMaxX + islandGap, 0);
  });

  // Center camera on primary origin
  const origin = newItems.find(i => i.isOrigin) || sortedRoots[0] || standalone[0];
  let targetVX = windowSize.w / 2 - (origin ? (origin.x + 16) : 0) * zoom;
  let targetVY = windowSize.h / 2 - (origin ? (origin.y - HEADER_OFFSET + 16) : 0) * zoom;

  return { items: newItems, viewOffset: { x: targetVX, y: targetVY } };
}
