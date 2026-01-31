/**
 * GBTF Master Protocol: Manhattan Loom Routing Engine
 * Version: 6.2 [Industrial Schematic]
 */

import { CanvasItem } from './types';

const GRID_SIZE = 32;
const TILE_PENALTY = 1000000;
const LATERAL_PENALTY = 2000;
const TURN_PENALTY = 50;
const FAN_OUT_DISTANCE = 1; // Projection is exactly one cell block
const HEADER_OFFSET = 56;

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
const isInsideTileExclusion = (p: Point, tiles: CanvasItem[], startPoint: Point, endPoint: Point) => {
  if ((Math.abs(p.x - startPoint.x) < 2 && Math.abs(p.y - startPoint.y) < 2) ||
      (Math.abs(p.x - endPoint.x) < 2 && Math.abs(p.y - endPoint.y) < 2)) {
    return false;
  }

  for (const tile of tiles) {
    const buffer = 2; 
    const left = tile.x - buffer;
    const right = tile.x + GRID_SIZE + buffer;
    const top = (tile.y - HEADER_OFFSET) - buffer;
    const bottom = (tile.y - HEADER_OFFSET) + GRID_SIZE + buffer;

    if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) {
      return true;
    }
  }
  return false;
};

/**
 * Calculates lateral penalty for moving adjacent to its own history or other paths.
 */
const getLateralPenalty = (neighbor: Point, history: Point[]) => {
  let penalty = 0;
  const threshold = 1.1 * GRID_SIZE;

  for (const point of history) {
    const dx = Math.abs(neighbor.x - point.x);
    const dy = Math.abs(neighbor.y - point.y);
    if (dx <= threshold && dy <= threshold && (dx > 0 || dy > 0)) {
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

/**
 * Samples a point at a specific percentage along the path segments.
 */
const getPointAtProgress = (points: Point[], progress: number) => {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  let totalLength = 0;
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const d = Math.sqrt(Math.pow(points[i+1].x - points[i].x, 2) + Math.pow(points[i+1].y - points[i].y, 2));
    totalLength += d;
    segments.push({ start: points[i], end: points[i+1], length: d, cumulative: totalLength });
  }

  const targetDist = totalLength * progress;
  const segment = segments.find(s => s.cumulative >= targetDist) || segments[segments.length - 1];
  
  const segmentProgress = segment.length === 0 ? 0 : (targetDist - (segment.cumulative - segment.length)) / segment.length;
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) * segmentProgress,
    y: segment.start.y + (segment.end.y - segment.start.y) * segmentProgress
  };
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
  tiles: CanvasItem[]
) => {
  const startPoint = { x: sX, y: sY };
  const endPoint = { x: tX, y: tY };

  let startDir = { x: 0, y: 0 };
  if (sourceSide === 'right') startDir.x = 1;
  else if (sourceSide === 'left') startDir.x = -1;
  else if (sourceSide === 'bottom') startDir.y = 1;
  else if (sourceSide === 'top') startDir.y = -1;

  let currentPos = startPoint;
  let forcedHistory: Point[] = [currentPos];
  
  for (let i = 0; i < FAN_OUT_DISTANCE; i++) {
    currentPos = {
      x: getCenter(currentPos.x + startDir.x * GRID_SIZE),
      y: getCenter(currentPos.y + startDir.y * GRID_SIZE)
    };
    forcedHistory.push(currentPos);
  }

  const target = endPoint;
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
  const MAX_ITERATIONS = 600;

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
      if (current.direction && d.x === -current.direction.x && d.y === -current.direction.y) continue;

      const neighbor = {
        x: current.x + d.x * GRID_SIZE,
        y: current.y + d.y * GRID_SIZE
      };

      const nKey = `${neighbor.x},${neighbor.y}`;
      if (closedSet.has(nKey)) continue;
      if (isInsideTileExclusion(neighbor, tiles, startPoint, endPoint)) continue;

      const lateralPenalty = getLateralPenalty(neighbor, current.history);
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

  const finalPoints: Point[] = finalNode ? [...finalNode.history, target] : [startPoint, target];
  return {
    d: generateRoundedPath(finalPoints),
    mid: getPointAtProgress(finalPoints, 0.5)
  };
};
