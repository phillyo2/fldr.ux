
import { CanvasItem, Connection } from './types';
import { GRID_SIZE, HEADER_OFFSET } from './constants';
import { snapToGrid, isAncestor } from './pathing';

/**
 * Island Gathering Engine v2.0 [Black Boxed]
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

  const findSafePosition = (startX: number, startY: number, stepX: number, stepY: number) => {
    let tx = startX, ty = startY;
    let safety = 0;
    while (occupied.has(getPosKey(tx, ty)) && safety < 1000) {
      tx += stepX; ty += stepY; safety++;
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
    item.x = snapToGrid(sx + (idx % 8) * GRID_SIZE, 0);
    item.y = snapToGrid(sy + Math.floor(idx / 8) * GRID_SIZE, HEADER_OFFSET);
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
    let maxNodeXForThisTree = currentFlowX;
    
    const processNode = (nodeId: string, cx: number, cy: number) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      occupied.add(getPosKey(cx, cy));
      maxNodeXForThisTree = Math.max(maxNodeXForThisTree, cx);
      
      const node = newItems.find(i => i.instanceId === nodeId);
      if (node) { node.x = cx; node.y = cy; }

      const outgoing = connections.filter(c => c.sourceId === nodeId);
      outgoing.forEach(conn => {
        if (visited.has(conn.targetId)) return;
        
        // Mode-based spacing
        let step = mode === 'grid' ? GRID_SIZE : GRID_SIZE * 2;
        
        // RULE: Recursive connections (Blue) NEVER snap adjacent
        const isRecursive = conn.color.includes('blue') || isAncestor(conn.targetId, conn.sourceId, connections);
        if (isRecursive) {
          step = GRID_SIZE * 2; 
        }

        let tx = cx, ty = cy;
        if (conn.sourceSide === 'bottom') ty += step;
        else if (conn.sourceSide === 'right') tx += step;
        else if (conn.sourceSide === 'left') tx -= step;
        else if (conn.sourceSide === 'top') ty -= step;

        const { tx: finalX, ty: finalY } = findSafePosition(snapToGrid(tx, 0), snapToGrid(ty, HEADER_OFFSET), 0, GRID_SIZE);
        processNode(conn.targetId, finalX, finalY);
      });
    };

    processNode(root.instanceId, currentFlowX, startY);
    currentFlowX = snapToGrid(maxNodeXForThisTree + GRID_SIZE * 4, 0);
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
