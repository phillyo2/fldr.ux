
import { CanvasItem, Connection } from './types';
import { GRID_SIZE, HEADER_OFFSET } from './constants';
import { snapToGrid, isAncestor } from './pathing';

/**
 * Island Gathering Engine v2.1 [Directional Shifting & Collision Avoidance]
 * Pure logic for Crossword (Adjacent) and Tether (Spaced) layout organization.
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

  // Tether mode enforces mandatory spacing (2 grid units)
  // Grid mode allows adjacency (1 grid unit)
  const stepSize = mode === 'grid' ? GRID_SIZE : GRID_SIZE * 2;

  /**
   * Smart Occupancy Adjustment
   * If a cell is taken, search in the intended direction of flow to push the subtree.
   */
  const findSafePosition = (startX: number, startY: number, direction: 'left' | 'right' | 'bottom') => {
    let tx = startX, ty = startY;
    let safety = 0;
    while (occupied.has(getPosKey(tx, ty)) && safety < 1000) {
      if (direction === 'bottom') ty += GRID_SIZE;
      else if (direction === 'left') tx -= GRID_SIZE;
      else if (direction === 'right') tx += GRID_SIZE;
      safety++;
    }
    return { tx, ty };
  };

  const connIds = new Set([
    ...connections.map(c => c.sourceId),
    ...connections.map(c => c.targetId)
  ]);

  const standalone = newItems.filter(i => !connIds.has(i.instanceId) && !i.isTrigger && !i.isOrigin);
  const inFlow = newItems.filter(i => connIds.has(i.instanceId) || i.isTrigger || i.isOrigin);
  const incomingTargetIds = new Set(connections.map(c => c.targetId));
  const roots = inFlow.filter(i => !incomingTargetIds.has(i.instanceId));

  // 1. Standalone Grid (Top-Left Island)
  let sx = 64, sy = 120;
  standalone.forEach((item, idx) => {
    const { tx, ty } = findSafePosition(
      snapToGrid(sx + (idx % 8) * GRID_SIZE, 0),
      snapToGrid(sy + Math.floor(idx / 8) * GRID_SIZE, HEADER_OFFSET),
      'right'
    );
    item.x = tx;
    item.y = ty;
    occupied.add(getPosKey(item.x, item.y));
    visited.add(item.instanceId);
  });

  // 2. Workflow Islands (Horizontal Side-by-Side)
  let currentFlowX = snapToGrid(windowSize.w / 2 - 16, 0);
  const startY = snapToGrid(windowSize.h * 0.4, HEADER_OFFSET);
  
  const sortedRoots = [...roots].sort((a, b) => {
    if (a.isOrigin) return -1;
    if (b.isOrigin) return 1;
    return a.instanceId.localeCompare(b.instanceId);
  });

  sortedRoots.forEach((root) => {
    let islandMaxX = currentFlowX;
    
    const processNode = (nodeId: string, cx: number, cy: number) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      const node = newItems.find(i => i.instanceId === nodeId);
      if (node) { 
        node.x = cx; 
        node.y = cy; 
        occupied.add(getPosKey(cx, cy));
        islandMaxX = Math.max(islandMaxX, cx);
      }

      // Priority order for flow: Bottom (Green), then Right (Red), then Left (Yellow)
      const outgoing = connections.filter(c => c.sourceId === nodeId);
      const sortedOutgoing = [...outgoing].sort((a, b) => {
        const order = { bottom: 0, right: 1, left: 2, top: 3 };
        return (order[a.sourceSide as keyof typeof order] ?? 4) - (order[b.sourceSide as keyof typeof order] ?? 4);
      });

      sortedOutgoing.forEach(conn => {
        if (visited.has(conn.targetId)) return;
        
        let tx = cx, ty = cy;
        let pushDir: 'left' | 'right' | 'bottom' = 'bottom';

        if (conn.sourceSide === 'bottom') {
          ty += stepSize;
          pushDir = 'bottom';
        } else if (conn.sourceSide === 'right') {
          tx += stepSize;
          pushDir = 'right';
        } else if (conn.sourceSide === 'left') {
          tx -= stepSize;
          pushDir = 'left';
        } else if (conn.sourceSide === 'top') {
          ty -= stepSize;
          pushDir = 'bottom';
        }

        // Apply directional shifting if position is taken
        const { tx: finalX, ty: finalY } = findSafePosition(snapToGrid(tx, 0), snapToGrid(ty, HEADER_OFFSET), pushDir);
        processNode(conn.targetId, finalX, finalY);
      });
    };

    processNode(root.instanceId, currentFlowX, startY);
    // Dynamic island pushing: ensure next root has space based on width of current tree
    currentFlowX = snapToGrid(islandMaxX + GRID_SIZE * 6, 0);
  });

  // Camera Pan to Origin
  const origin = newItems.find(i => i.isOrigin) || sortedRoots[0] || standalone[0];
  let targetVX = 0;
  let targetVY = 0;
  if (origin) {
    targetVX = windowSize.w / 2 - (origin.x + 16) * zoom;
    targetVY = windowSize.h / 2 - (origin.y - HEADER_OFFSET + 16) * zoom;
  }

  return { items: newItems, viewOffset: { x: targetVX, y: targetVY } };
}
