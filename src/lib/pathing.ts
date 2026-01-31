/**
 * GBTF Master Protocol: A* Manhattan Routing Engine
 * Version: 5.0 [Industrial Loom]
 */

import { CanvasItem, Connection } from './types';

const GRID_SIZE = 32;
const TILE_EXCLUSION_PENALTY = 1000000;
const PROXIMITY_PENALTY = 50;
const TURN_PENALTY = 10;
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
  direction: string | null;
}

/**
 * Calculates the Manhattan distance between two points
 */
const getHeuristic = (a: Point, b: Point) => {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
};

/**
 * Checks if a point is within a tile's exclusion zone (tile + 1 grid unit buffer)
 */
const isInsideTileExclusion = (p: Point, tiles: CanvasItem[], targetId: string, sourceId: string) => {
  for (const tile of tiles) {
    // We allow the path to be at the connection points of the source and target tiles
    if (tile.instanceId === sourceId || tile.instanceId === targetId) continue;

    const buffer = GRID_SIZE;
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
 * Generates the SVG path string from A* results with rounded corners
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
  // 1. FAN-OUT: Initialize start position and force movement away from tile
  let startPoints: Point[] = [{ x: sX, y: sY }];
  let currentPos = { x: sX, y: sY };
  let exitVector = { x: 0, y: 0 };

  if (sourceSide === 'right') exitVector.x = GRID_SIZE;
  else if (sourceSide === 'left') exitVector.x = -GRID_SIZE;
  else if (sourceSide === 'bottom') exitVector.y = GRID_SIZE;
  else if (sourceSide === 'top') exitVector.y = -GRID_SIZE;

  for (let i = 0; i < FAN_OUT_DISTANCE; i++) {
    currentPos = { x: currentPos.x + exitVector.x, y: currentPos.y + exitVector.y };
    startPoints.push({ ...currentPos });
  }

  // 2. A* SEARCH
  const target = { x: tX, y: tY };
  const openList: AStarNode[] = [
    {
      ...currentPos,
      g: 0,
      f: getHeuristic(currentPos, target),
      parent: null,
      direction: sourceSide,
    },
  ];
  const closedList = new Set<string>();

  let finalNode: AStarNode | null = null;
  let iterations = 0;
  const MAX_ITERATIONS = 500; // Safety break

  while (openList.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    // Sort by f score (lowest first)
    openList.sort((a, b) => a.f - b.f);
    const current = openList.shift()!;
    const key = `${current.x},${current.y}`;

    if (Math.abs(current.x - target.x) < 5 && Math.abs(current.y - target.y) < 5) {
      finalNode = current;
      break;
    }

    closedList.add(key);

    const neighbors = [
      { x: current.x + GRID_SIZE, y: current.y, dir: 'right' },
      { x: current.x - GRID_SIZE, y: current.y, dir: 'left' },
      { x: current.x, y: current.y + GRID_SIZE, dir: 'bottom' },
      { x: current.x, y: current.y - GRID_SIZE, dir: 'top' },
    ];

    for (const neighbor of neighbors) {
      if (closedList.has(`${neighbor.x},${neighbor.y}`)) continue;

      let moveCost = GRID_SIZE;

      // RULE: Exclusion Zones
      if (isInsideTileExclusion(neighbor, tiles, targetId, sourceId)) {
        moveCost += TILE_EXCLUSION_PENALTY;
      }

      // RULE: Proximity Penalty (Avoid other paths)
      const isNearOtherPath = 
        globalOccupancy.has(`${neighbor.x + GRID_SIZE},${neighbor.y}`) ||
        globalOccupancy.has(`${neighbor.x - GRID_SIZE},${neighbor.y}`) ||
        globalOccupancy.has(`${neighbor.x},${neighbor.y + GRID_SIZE}`) ||
        globalOccupancy.has(`${neighbor.x},${neighbor.y - GRID_SIZE}`);
      
      if (isNearOtherPath) {
        moveCost += PROXIMITY_PENALTY;
      }

      // RULE: Turn Penalty
      if (current.direction && current.direction !== neighbor.dir) {
        moveCost += TURN_PENALTY;
      }

      const g = current.g + moveCost;
      const h = getHeuristic(neighbor, target);
      const f = g + h;

      const existingInOpen = openList.find(n => n.x === neighbor.x && n.y === neighbor.y);
      if (existingInOpen && existingInOpen.g <= g) continue;

      if (!existingInOpen) {
        openList.push({ ...neighbor, g, f, parent: current, direction: neighbor.dir });
      } else {
        existingInOpen.g = g;
        existingInOpen.f = f;
        existingInOpen.parent = current;
        existingInOpen.direction = neighbor.dir;
      }
    }
  }

  // 3. RECONSTRUCT PATH
  const points: Point[] = [];
  let curr: AStarNode | null = finalNode;
  while (curr) {
    points.unshift({ x: curr.x, y: curr.y });
    curr = curr.parent;
  }

  // Combine Fan-out with A* path
  const finalPoints = [...startPoints.slice(0, -1), ...points];
  
  // Add target point if Iteration limit hit early
  if (finalPoints[finalPoints.length - 1].x !== tX || finalPoints[finalPoints.length - 1].y !== tY) {
    finalPoints.push({ x: tX, y: tY });
  }

  return generateRoundedPath(finalPoints);
};
