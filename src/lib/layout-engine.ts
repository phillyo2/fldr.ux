
import { CanvasItem, Connection } from './types';
import { GRID_SIZE, HEADER_OFFSET } from './constants';
import { snapToGrid } from './pathing';

/**
 * Island Gathering Engine v6.0 [Lane Isolation & Fragmentation]
 * Pure logic for Crossword (Adjacent) and Tether (Spaced) layout organization.
 * 
 * Rules:
 * 1. Data (Fuchsia) and Recursive (Blue) connections create new independent islands.
 * 2. Yellow (Left) branches create a strict lane boundary to the left of the parent.
 * 3. Red (Right) branches create a strict lane boundary to the right of the parent.
 * 4. Subtrees can never cross the vertical boundary established by their birth tether.
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
   * Directional Occupancy Adjustment
   * Respects lane boundaries and prevents tile overlapping.
   */
  const findSafePosition = (
    startX: number, 
    startY: number, 
    direction: 'left' | 'right' | 'bottom',
    minX: number = -Infinity,
    maxX: number = Infinity
  ) => {
    let tx = startX, ty = startY;
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
      
      // If we hit a boundary but it's still occupied, we must go down
      if (occupied.has(getPosKey(tx, ty))) {
        ty += stepSize;
      }
      safety++;
    }
    return { tx, ty };
  };

  // Identify Execution Flow Connections (Green, Red, Yellow)
  // Exclude Data (Fuchsia) and Recursive (Blue) as they trigger new islands
  const flowConnections = connections.filter(c => 
    !c.color.includes('fuchsia') && !c.color.includes('blue')
  );

  // Identify all roots (origins, triggers, or targets of data/recursive connections)
  const triggers = new Set(newItems.filter(i => i.isTrigger || i.isOrigin).map(i => i.instanceId));
  const dataRecursiveTargets = new Set(connections.filter(c => c.color.includes('fuchsia') || c.color.includes('blue')).map(c => c.targetId));
  
  const incomingFlowTargets = new Set(flowConnections.map(c => c.targetId));
  const rootIds = newItems
    .filter(i => triggers.has(i.instanceId) || dataRecursiveTargets.has(i.instanceId) || !incomingFlowTargets.has(i.instanceId))
    .map(i => i.instanceId);

  // 1. Standalone Pack (Top-Left)
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

  // 2. Sequential Island Layout
  let currentLaneStartX = snapToGrid(windowSize.w / 2 - 16, 0);
  const startY = snapToGrid(windowSize.h * 0.4, HEADER_OFFSET);

  // Priority order: Origins/Triggers first
  const sortedRoots = rootIds.map(id => newItems.find(i => i.instanceId === id)!).sort((a, b) => {
    if (a.isOrigin || a.isTrigger) return -1;
    if (b.isOrigin || b.isTrigger) return 1;
    return a.instanceId.localeCompare(b.instanceId);
  });

  sortedRoots.forEach((root) => {
    if (!root || visited.has(root.instanceId)) return;
    
    let islandMaxX = currentLaneStartX;
    let islandMinX = currentLaneStartX;

    const processNode = (nodeId: string, cx: number, cy: number, minX: number, maxX: number) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      const node = newItems.find(i => i.instanceId === nodeId);
      if (node) { 
        node.x = cx; 
        node.y = cy; 
        occupied.add(getPosKey(cx, cy));
        islandMaxX = Math.max(islandMaxX, cx);
        islandMinX = Math.min(islandMinX, cx);
      }

      const outgoing = flowConnections.filter(c => c.sourceId === nodeId);
      outgoing.forEach(conn => {
        if (visited.has(conn.targetId)) return;
        
        let tx = cx, ty = cy;
        let pushDir: 'left' | 'right' | 'bottom' = 'bottom';
        let childMinX = minX;
        let childMaxX = maxX;

        if (conn.sourceSide === 'bottom') {
          ty += stepSize;
          pushDir = 'bottom';
        } else if (conn.sourceSide === 'right') {
          tx += stepSize;
          pushDir = 'right';
          // Start a rightward lane: must stay right of parent
          childMinX = cx + stepSize;
        } else if (conn.sourceSide === 'left') {
          tx -= stepSize;
          pushDir = 'left';
          // Start a leftward lane: must stay left of parent
          childMaxX = cx - stepSize;
        }

        const { tx: finalX, ty: finalY } = findSafePosition(
          snapToGrid(tx, 0), 
          snapToGrid(ty, HEADER_OFFSET), 
          pushDir,
          childMinX,
          childMaxX
        );
        processNode(conn.targetId, finalX, finalY, childMinX, childMaxX);
      });
    };

    // Initialize root in its corridor
    processNode(root.instanceId, currentLaneStartX, startY, -Infinity, Infinity);
    
    // Push the next root island beyond the bounds of this one
    currentLaneStartX = snapToGrid(islandMaxX + islandGap, 0);
  });

  // Orient camera on the primary origin
  const origin = newItems.find(i => i.isOrigin) || sortedRoots[0] || standalone[0];
  let targetVX = windowSize.w / 2 - (origin ? (origin.x + 16) : 0) * zoom;
  let targetVY = windowSize.h / 2 - (origin ? (origin.y - HEADER_OFFSET + 16) : 0) * zoom;

  return { items: newItems, viewOffset: { x: targetVX, y: targetVY } };
}
