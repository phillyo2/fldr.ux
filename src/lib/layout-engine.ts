
import { CanvasItem, Connection } from './types';
import { GRID_SIZE, HEADER_OFFSET } from './constants';
import { snapToGrid } from './pathing';

/**
 * Island Gathering Engine v5.0 [Corridor Isolation]
 * Pure logic for Crossword (Adjacent) and Tether (Spaced) layout organization.
 * Strictly enforces Vertical Lane Isolation: Each workflow island occupies an 
 * exclusive horizontal "corridor" that no other tree can cross over or under.
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
  const islandGap = GRID_SIZE * (mode === 'grid' ? 4 : 6);

  /**
   * Smart Occupancy Adjustment
   * Finds the next available cell in the intended direction.
   */
  const findSafePosition = (startX: number, startY: number, direction: 'left' | 'right' | 'bottom') => {
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

  // 1. Standalone Grid Island (Top-Left Reserved Section)
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

  // 2. Vertical Corridor Islands (Strictly side-by-side)
  // We determine a baseline X and then push the "Lane Boundary" after each tree
  let currentLaneStartX = snapToGrid(windowSize.w / 2 - 16, 0);
  const startY = snapToGrid(windowSize.h * 0.4, HEADER_OFFSET);
  
  // Sort roots to maintain consistent horizontal order
  const sortedRoots = [...roots].sort((a, b) => {
    if (a.isOrigin) return -1;
    if (b.isOrigin) return 1;
    return a.instanceId.localeCompare(b.instanceId);
  });

  sortedRoots.forEach((root) => {
    let islandMaxX = currentLaneStartX;
    
    // Recursive traversal to lay out the tree within its corridor
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

      // Get outgoing connections and sort them by side to determine flow priority
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

    // Initialize root in the next available lane
    processNode(root.instanceId, currentLaneStartX, startY);
    
    // Strict Lane Boundary Protection: 
    // The next island MUST start after the widest point of the current island + buffer.
    currentLaneStartX = snapToGrid(islandMaxX + islandGap, 0);
  });

  // Calculate camera orientation targeting the primary origin
  const origin = newItems.find(i => i.isOrigin) || sortedRoots[0] || standalone[0];
  let targetVX = windowSize.w / 2 - (origin ? (origin.x + 16) : 0) * zoom;
  let targetVY = windowSize.h / 2 - (origin ? (origin.y - HEADER_OFFSET + 16) : 0) * zoom;

  return { items: newItems, viewOffset: { x: targetVX, y: targetVY } };
}
