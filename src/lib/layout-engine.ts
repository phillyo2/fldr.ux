
import { CanvasItem, Connection } from './types';
import { GRID_SIZE, HEADER_OFFSET } from './constants';
import { snapToGrid } from './pathing';

/**
 * Island Gathering Engine v4.0 [Boundary Protected]
 * Pure logic for Crossword (Adjacent) and Tether (Spaced) layout organization.
 * Strictly enforces Zero-Overlap and protects tree boundaries via recursive horizontal pushing.
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

  // Grid mode allows adjacency (1 grid unit)
  // Tether mode forbids adjacency (min 2 grid units)
  const stepSize = mode === 'grid' ? GRID_SIZE : GRID_SIZE * 2;

  /**
   * Smart Occupancy Adjustment
   * If a cell is taken, search in the intended direction of flow.
   * Special Rule: If a branch encroaches on another tree's space, push it horizontally.
   */
  const findSafePosition = (startX: number, startY: number, direction: 'left' | 'right' | 'bottom') => {
    let tx = startX, ty = startY;
    let safety = 0;
    while (occupied.has(getPosKey(tx, ty)) && safety < 1000) {
      if (direction === 'bottom') {
        // If bottom is blocked by another tree, prioritize pushing RIGHT to clear the boundary
        ty += stepSize;
        if (safety > 5) tx += stepSize; 
      }
      else if (direction === 'left') tx -= stepSize;
      else if (direction === 'right') tx += stepSize;
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

        const { tx: finalX, ty: finalY } = findSafePosition(snapToGrid(tx, 0), snapToGrid(ty, HEADER_OFFSET), pushDir);
        processNode(conn.targetId, finalX, finalY);
      });
    };

    // Ensure the start of this island doesn't conflict with existing occupancy
    const { tx: rootX, ty: rootY } = findSafePosition(currentFlowX, startY, 'right');
    processNode(root.instanceId, rootX, rootY);
    
    // Push next island boundary
    currentFlowX = snapToGrid(islandMaxX + GRID_SIZE * (mode === 'grid' ? 4 : 6), 0);
  });

  const origin = newItems.find(i => i.isOrigin) || sortedRoots[0] || standalone[0];
  let targetVX = windowSize.w / 2 - (origin ? (origin.x + 16) : 0) * zoom;
  let targetVY = windowSize.h / 2 - (origin ? (origin.y - HEADER_OFFSET + 16) : 0) * zoom;

  return { items: newItems, viewOffset: { x: targetVX, y: targetVY } };
}
