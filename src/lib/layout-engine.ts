
import { CanvasItem, Connection } from './types';
import { GRID_SIZE, HEADER_OFFSET } from './constants';
import { snapToGrid } from './pathing';

/**
 * Island Gathering Engine v12.0 [Universal Corridor & Terminal Waterfall Isolation]
 * Pure logic for Crossword (Adjacent) and Tether (Spaced) layout organization.
 * 
 * Rules:
 * 1. Universal Subtree Flow: In Tether mode, Green and Red connections are treated as distinct 
 *    subtree flows that establish and respect horizontal/vertical boundaries.
 * 2. Vertical Lane Isolation (X-axis): Branches are trapped in lanes defined by their parent's 
 *    vertical slice. A branch cannot cross its parent's X-boundary.
 * 3. Horizontal Slice Isolation (Y-axis): Descendants always stay below their parent's horizon 
 *    (minY = parent.y + step).
 * 4. Terminal Waterfall Floor: Ancestor terminal nodes establish a maxY horizontal floor for their 
 *    specific vertical corridor.
 * 5. Terminal Vertical Slice: Descendant terminal nodes define the horizontal footprint of their 
 *    corridor. Expansion at the base pushes parallel sibling or ancestor trees strictly outward.
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

  // Global registries for Waterfall (Y) and Corridor (X) enforcement
  const corridorFloorY = new Map<number, number>(); // snapToGrid(x) -> maxY floor established by terminal nodes
  const laneBreadthX = new Map<number, { min: number, max: number }>(); // vertical slice -> current horizontal extent

  const updateGlobalSpatialState = (x: number, y: number, isTerminal: boolean) => {
    const corridorX = snapToGrid(x, 0);
    
    // Update terminal waterfall floor if this is a leaf node
    if (isTerminal) {
      corridorFloorY.set(corridorX, Math.max(corridorFloorY.get(corridorX) || 0, y));
    }

    // Update horizontal breadth per vertical slice
    const snapY = snapToGrid(y, HEADER_OFFSET);
    const current = laneBreadthX.get(snapY) || { min: x, max: x };
    laneBreadthX.set(snapY, {
      min: Math.min(current.min, x),
      max: Math.max(current.max, x)
    });
  };

  /**
   * Directional Collision Resolution
   * Respects Vertical Lane (minX/maxX), Horizontal Slice (minY), and Waterfall (corridorFloorY) boundaries.
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
    
    // Enforce Waterfall Floor (Ancestor terminal nodes above this corridor)
    const corridorX = snapToGrid(tx, 0);
    const floorY = corridorFloorY.get(corridorX) || 0;
    if (mode === 'tether' && ty < floorY + stepSize) {
      ty = floorY + stepSize;
    }

    // Snap to lane boundaries immediately
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
      
      // Re-apply constraints after shift
      if (tx < minX) tx = minX;
      if (tx > maxX) tx = maxX;
      if (ty < minY) ty = minY;
      
      // Secondary vertical cascade if horizontal shifts fail to find a gap within a lane
      if (occupied.has(getPosKey(tx, ty))) {
        ty += stepSize;
      }
      safety++;
    }
    return { tx, ty };
  };

  // Grid Mode Fragments on Data/Recursion for dense isolation. 
  // Tether Mode treats them as standard flow but uses strict lane/slice boundaries.
  const isGrid = mode === 'grid';
  const flowConnections = isGrid 
    ? connections.filter(c => !c.color.includes('fuchsia') && !c.color.includes('blue'))
    : connections;

  const triggers = new Set(newItems.filter(i => i.isTrigger || i.isOrigin).map(i => i.instanceId));
  const rootIds = newItems
    .filter(i => triggers.has(i.instanceId) || !connections.some(c => c.targetId === i.instanceId))
    .map(i => i.instanceId);

  // 1. Pack Isolated Items (Top-Left Industrial Density)
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
    updateGlobalSpatialState(item.x, item.y, true);
  });

  // 2. Traversal with Universal Subtree Isolation
  let currentIslandX = snapToGrid(windowSize.w / 2 - 16, 0);
  const startYBase = snapToGrid(windowSize.h * 0.4, HEADER_OFFSET);

  const sortedRoots = rootIds.map(id => newItems.find(i => i.instanceId === id)!).sort((a, b) => {
    if (a.isOrigin || a.isTrigger) return -1;
    if (b.isOrigin || b.isTrigger) return 1;
    return a.instanceId.localeCompare(b.instanceId);
  });

  sortedRoots.forEach((root) => {
    if (!root || visited.has(root.instanceId)) return;
    
    // Tracks the global horizontal footprint of this specific logic island
    let islandExtentMaxX = currentIslandX;

    const processNode = (nodeId: string, cx: number, cy: number, minX: number, maxX: number, minY: number) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      const node = newItems.find(i => i.instanceId === nodeId);
      const outgoing = flowConnections.filter(c => c.sourceId === nodeId);
      const isTerminal = outgoing.length === 0;

      if (node) { 
        node.x = cx; 
        node.y = cy; 
        occupied.add(getPosKey(cx, cy));
        islandExtentMaxX = Math.max(islandExtentMaxX, cx);
        updateGlobalSpatialState(cx, cy, isTerminal);
      }

      const sortedOutgoing = outgoing.sort((a, b) => {
        const order = { 'bottom': 0, 'right': 1, 'left': 2 };
        return (order[a.sourceSide as keyof typeof order] || 3) - (order[b.sourceSide as keyof typeof order] || 3);
      });

      sortedOutgoing.forEach(conn => {
        if (visited.has(conn.targetId)) return;
        
        let tx = cx, ty = cy;
        let pushDir: 'left' | 'right' | 'bottom' = 'bottom';
        
        // Boundaries established by the vertical slice of the parent tree
        let childMinX = minX;
        let childMaxX = maxX;
        let childMinY = !isGrid ? cy + stepSize : -Infinity;

        if (conn.sourceSide === 'bottom') {
          ty += stepSize;
          pushDir = 'bottom';
          // Stay within current lane
        } else if (conn.sourceSide === 'right') {
          tx += stepSize;
          pushDir = 'right';
          // LOCK: Descendant branch must stay to the right of this vertical slice
          if (mode === 'tether') childMinX = Math.max(minX, cx + stepSize);
        } else if (conn.sourceSide === 'left') {
          tx -= stepSize;
          pushDir = 'left';
          // LOCK: Descendant branch must stay to the left of this vertical slice
          if (mode === 'tether') childMaxX = Math.min(maxX, cx - stepSize);
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

    processNode(root.instanceId, currentIslandX, startYBase, -Infinity, Infinity, -Infinity);
    
    // Vertical Corridor Pushing: Move the next island beyond the footprint of the current waterfall
    currentIslandX = snapToGrid(islandExtentMaxX + islandGap, 0);
  });

  // Focus camera on the logic origin
  const origin = newItems.find(i => i.isOrigin) || sortedRoots[0] || standalone[0];
  let targetVX = windowSize.w / 2 - (origin ? (origin.x + 16) : 0) * zoom;
  let targetVY = windowSize.h / 2 - (origin ? (origin.y - HEADER_OFFSET + 16) : 0) * zoom;

  return { items: newItems, viewOffset: { x: targetVX, y: targetVY } };
}
