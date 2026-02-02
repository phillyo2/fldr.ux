
import { CanvasItem, Connection } from './types';
import { GRID_SIZE, HEADER_OFFSET } from './constants';
import { snapToGrid } from './pathing';

/**
 * Island Gathering Engine v11.0 [Waterfall Lane & Terminal Vertical Corridor Isolation]
 * Pure logic for Crossword (Adjacent) and Tether (Spaced) layout organization.
 * 
 * Rules:
 * 1. Mode Isolation: Grid mode (Crossword) uses adjacent spacing; Tether mode uses 2-cell gaps.
 * 2. Vertical Lane Isolation (X-axis): Branches from a parent vertical slice are trapped in lanes.
 * 3. Horizontal Slice Isolation (Y-axis): Descendants always stay below their parent's horizon.
 * 4. Terminal Waterfall (Y-axis): Ancestor terminal nodes establish a horizontal "floor" for their zone.
 * 5. Terminal Vertical Slice (X-axis): Descendant terminal nodes define the full width of their corridor.
 *    Any expansion at the bottom of a tree pushes parallel ancestor/sibling trees strictly outward.
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
  const zoneMaxY = new Map<number, number>(); // snapToGrid(x) -> maxY floor
  const laneOccupancyX = new Map<number, { min: number, max: number }>(); // vertical level -> range used

  const updateGlobalOccupancy = (x: number, y: number) => {
    // Update Waterfall (Y)
    const corridorX = snapToGrid(x, 0);
    zoneMaxY.set(corridorX, Math.max(zoneMaxY.get(corridorX) || 0, y));

    // Update Corridor (X) - Track used ranges per vertical slice to push siblings
    const snapY = snapToGrid(y, HEADER_OFFSET);
    const current = laneOccupancyX.get(snapY) || { min: x, max: x };
    laneOccupancyX.set(snapY, {
      min: Math.min(current.min, x),
      max: Math.max(current.max, x)
    });
  };

  /**
   * Directional Occupancy & Boundary Adjustment
   * Respects Vertical Lane (X), Horizontal Slice (Y), and Waterfall (maxY) boundaries.
   * Enforces that subtrees push siblings/ancestors outward based on terminal footprints.
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
    
    // Enforce Waterfall Floor: Check if this vertical corridor has a terminal node floor above it
    const zoneFloor = zoneMaxY.get(snapToGrid(tx, 0)) || 0;
    if (mode === 'tether' && ty < zoneFloor + stepSize) {
      ty = zoneFloor + stepSize;
    }

    let safety = 0;
    // Enforce lane boundaries (Vertical Slices)
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
      
      // Re-apply boundaries after shift
      if (tx < minX) tx = minX;
      if (tx > maxX) tx = maxX;
      if (ty < minY) ty = minY;
      
      // If still occupied after lane shift, we must cascade downward
      if (occupied.has(getPosKey(tx, ty))) {
        ty += stepSize;
      }
      safety++;
    }
    return { tx, ty };
  };

  // Only fragment for Grid Mode (Crossword isolation)
  const isGrid = mode === 'grid';
  const flowConnections = isGrid 
    ? connections.filter(c => !c.color.includes('fuchsia') && !c.color.includes('blue'))
    : connections;

  const triggers = new Set(newItems.filter(i => i.isTrigger || i.isOrigin).map(i => i.instanceId));
  const rootIds = newItems
    .filter(i => triggers.has(i.instanceId) || !connections.some(c => c.targetId === i.instanceId))
    .map(i => i.instanceId);

  // 1. Pack Standalone Items (Top-Left Industrial Density)
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
    updateGlobalOccupancy(item.x, item.y);
  });

  // 2. Sequential Waterfall Gathering with Corridor Pushing
  let currentIslandX = snapToGrid(windowSize.w / 2 - 16, 0);
  const startYBase = snapToGrid(windowSize.h * 0.4, HEADER_OFFSET);

  const sortedRoots = rootIds.map(id => newItems.find(i => i.instanceId === id)!).sort((a, b) => {
    if (a.isOrigin || a.isTrigger) return -1;
    if (b.isOrigin || b.isTrigger) return 1;
    return a.instanceId.localeCompare(b.instanceId);
  });

  sortedRoots.forEach((root) => {
    if (!root || visited.has(root.instanceId)) return;
    
    // Tracks the horizontal "Terminal Slice" for this entire island
    let islandExtentMinX = currentIslandX;
    let islandExtentMaxX = currentIslandX;

    const processNode = (nodeId: string, cx: number, cy: number, minX: number, maxX: number, minY: number) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      const node = newItems.find(i => i.instanceId === nodeId);
      if (node) { 
        node.x = cx; 
        node.y = cy; 
        occupied.add(getPosKey(cx, cy));
        
        // Update the island's horizontal corridor footprint
        islandExtentMinX = Math.min(islandExtentMinX, cx);
        islandExtentMaxX = Math.max(islandExtentMaxX, cx);
        
        updateGlobalOccupancy(cx, cy);
      }

      const outgoing = flowConnections.filter(c => c.sourceId === nodeId);
      
      // Terminal nodes establish the corridor's floor and vertical slice
      if (outgoing.length === 0 && mode === 'tether') {
        updateGlobalOccupancy(cx, cy);
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
        
        // Enforce Horizontal Slice Boundary: Children must be strictly below parent
        let childMinY = !isGrid ? cy + stepSize : -Infinity;

        if (conn.sourceSide === 'bottom') {
          ty += stepSize;
          pushDir = 'bottom';
        } else if (conn.sourceSide === 'right') {
          tx += stepSize;
          pushDir = 'right';
          // Lock child to the right of parent vertical slice
          childMinX = Math.max(minX, cx + stepSize);
        } else if (conn.sourceSide === 'left') {
          tx -= stepSize;
          pushDir = 'left';
          // Lock child to the left of parent vertical slice
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

    // Initialize island within its corridor
    processNode(root.instanceId, currentIslandX, startYBase, -Infinity, Infinity, -Infinity);
    
    // Outward Push: The next island starts beyond the *widest* point of the previous subtree's corridor
    currentIslandX = snapToGrid(islandExtentMaxX + islandGap, 0);
  });

  // Camera focus on origin
  const origin = newItems.find(i => i.isOrigin) || sortedRoots[0] || standalone[0];
  let targetVX = windowSize.w / 2 - (origin ? (origin.x + 16) : 0) * zoom;
  let targetVY = windowSize.h / 2 - (origin ? (origin.y - HEADER_OFFSET + 16) : 0) * zoom;

  return { items: newItems, viewOffset: { x: targetVX, y: targetVY } };
}
