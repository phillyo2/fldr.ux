/**
 * GBTF Master Protocol: Manhattan Loom Routing Engine
 * Version: 6.0 [Industrial Schematic]
 */

import { CanvasItem } from './types';

const GRID_SIZE = 32;
const TILE_PENALTY = 1000000;
const LATERAL_PENALTY = 2000;
const TURN_PENALTY = 50;
const FAN_OUT_DISTANCE = 2;

export const snapToGrid = (val: number, offset = 0, gridSize = GRID_SIZE) =>
  Math.round((val - offset) / gridSize) * gridSize + offset;

interface Point {
  x: number;
  y: number;
}

interface AStarNode extends Point {
  g: number;
  f: number;
  parent: AStarNode | null;
  direction: Point | null;
  history: Point[];
}

/**
 * Snaps a coordinate to the center of the nearest grid cell.
 */
const getCenter = (coord: number) => {
  return Math.floor(coord / GRID_SIZE) * GRID_SIZE + (GRID_SIZE / 2);
};

/**
 * Checks if a point is inside the bounding box of any tile (with buffer).
 */
const isInsideTileExclusion = (p: Point, tiles: CanvasItem[], sourceId: string, targetId: string) => {
  for (const tile of tiles) {
    // We allow the path to enter/exit the source and target tiles
    if (tile.instanceId === sourceId || tile.instanceId === targetId) continue;

    const buffer = 4; // Minimal buffer to allow tight routing but no overlap
    const left = tile.x - buffer;
    const right = tile.x + GRID_SIZE + buffer;
    const top = tile.y - buffer;
    const bottom = tile.y + GRID_SIZE + buffer;

    if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) {
      return true;
    }
  }
  return false;
};

/**
 * Calculates lateral penalty for moving adjacent to its own history or other paths.
 * Prevents "hugging" and parallel line tangling.
 */
const getLateralPenalty = (neighbor: Point, history: Point[], globalOccupancy: Set<string>) => {
  let penalty = 0;
  const threshold = 1.1 * GRID_SIZE; // Captures adjacent parallel cells

  // 1. Self-lateral avoidance
  for (const point of history) {
    const dx = Math.abs(neighbor.x - point.x);
    const dy = Math.abs(neighbor.y - point.y);
    if (dx <= threshold && dy <= threshold && (dx > 0 || dy > 0)) {
      penalty += LATERAL_PENALTY;
    }
  }

  // 2. Global-lateral avoidance (Don't hug other lines)
  const lateralOffsets = [
    { x: GRID_SIZE, y: 0 }, { x: -GRID_SIZE, y: 0 },
    { x: 0, y: GRID_SIZE }, { x: 0, y: -GRID_SIZE }
  ];
  for (const off of lateralOffsets) {
    const key = `${neighbor.x + off.x},${neighbor.y + off.y}`;
    if (globalOccupancy.has(key)) {
      penalty += LATERAL_PENALTY;
    }
  }

  return penalty;
};

/**
 * Generates the SVG path string from points with rounded corners.
 */
const generateRoundedPath = (points: Point[]) => {
  if (points.length < 2) return '';
  const radius = 8;
  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    if (next) {
      const d1 = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
      const d2 = Math.sqrt(Math.pow(next.x - curr.x, 2) + Math.pow(next.y - curr.y, 2));
      const r = Math.min(radius, d1 / 2, d2 / 2);

      const v1 = { x: (curr.x - prev.x) / d1, y: (curr.y - prev.y) / d1 };
      const v2 = { x: (next.x - curr.x) / d2, y: (next.y - curr.y) / d2 };

      const pStart = { x: curr.x - v1.x * r, y: curr.y - v1.y * r };
      const pEnd = { x: curr.x + v2.x * r, y: curr.y + v2.y * r };

      d += ` L ${pStart.x} ${pStart.y} Q ${curr.x} ${curr.y} ${pEnd.x} ${pEnd.y}`;
    } else {
      d += ` L ${curr.x} ${curr.y}`;
    }
  }
  return d;
};

export const getSmartPath = (
  sX: number,
  sY: number,
  tX: number,
  tY: number,
  sourceSide: string,
  targetSide: string,
  sourceId: string,
  targetId: string,
  tiles: CanvasItem[],
  globalOccupancy: Set<string> = new Set()
) => {
  // 1. Initial Normal / Projection (FAN-OUT)
  let startDir = { x: 0, y: 0 };
  if (sourceSide === 'right') startDir.x = 1;
  else if (sourceSide === 'left') startDir.x = -1;
  else if (sourceSide === 'bottom') startDir.y = 1;
  else if (sourceSide === 'top') startDir.y = -1;

  // Project outward to escape tile face
  let currentPos = { x: sX, y: sY };
  let forcedHistory: Point[] = [currentPos];
  
  for (let i = 0; i < FAN_OUT_DISTANCE; i++) {
    currentPos = {
      x: getCenter(currentPos.x + startDir.x * GRID_SIZE),
      y: getCenter(currentPos.y + startDir.y * GRID_SIZE)
    };
    forcedHistory.push(currentPos);
  }

  const target = { x: tX, y: tY };
  const openSet: AStarNode[] = [{
    ...currentPos,
    g: 0,
    f: Math.abs(currentPos.x - target.x) + Math.abs(currentPos.y - target.y),
    parent: null,
    direction: startDir,
    history: forcedHistory
  }];
  const closedSet = new Set<string>();

  let finalNode: AStarNode | null = null;
  let iterations = 0;
  const MAX_ITERATIONS = 500;

  while (openSet.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;
    const key = `${current.x},${current.y}`;

    if (Math.abs(current.x - target.x) < GRID_SIZE && Math.abs(current.y - target.y) < GRID_SIZE) {
      finalNode = current;
      break;
    }

    if (closedSet.has(key)) continue;
    closedSet.add(key);

    const directions = [
      { x: 1, y: 0 }, { x: -1, y: 0 },
      { x: 0, y: 1 }, { x: 0, y: -1 }
    ];

    for (const d of directions) {
      // RULE: No 180-degree U-turns
      if (current.direction && d.x === -current.direction.x && d.y === -current.direction.y) continue;

      const neighbor = {
        x: current.x + d.x * GRID_SIZE,
        y: current.y + d.y * GRID_SIZE
      };

      const nKey = `${neighbor.x},${neighbor.y}`;
      if (closedSet.has(nKey)) continue;

      // RULE: Avoid Bounding Box of tiles (Exclusion Zone)
      if (isInsideTileExclusion(neighbor, tiles, sourceId, targetId)) continue;

      // RULE: Avoid borders of itself and other paths (Lateral Penalty)
      const lateralPenalty = getLateralPenalty(neighbor, current.history, globalOccupancy);
      
      // RULE: Turn Penalty to favor straight lines
      const turnPenalty = (current.direction && (d.x !== current.direction.x || d.y !== current.direction.y)) ? TURN_PENALTY : 0;

      const g = current.g + GRID_SIZE + lateralPenalty + turnPenalty;
      const h = Math.abs(neighbor.x - target.x) + Math.abs(neighbor.y - target.y);

      openSet.push({
        ...neighbor,
        g,
        f: g + h,
        parent: current,
        direction: d,
        history: [...current.history, neighbor]
      });
    }
  }

  const finalPoints: Point[] = finalNode ? [...finalNode.history, target] : [{ x: sX, y: sY }, target];
  return generateRoundedPath(finalPoints);
};
