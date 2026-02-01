
/**
 * Manhattan Loom Routing Engine v7.0 [Solid Flow Avoidance]
 * Refined Manhattan A* with recursive avoidance and parallel segment culling.
 */

import { CanvasItem, Connection } from './types';

const GRID_SIZE = 32;
const TURN_PENALTY = 60;
const OBSTACLE_PENALTY = 5000;
const CONGESTION_PENALTY = 200;

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
}

export const isAncestor = (potentialAncestorId: string, potentialDescendantId: string, conns: Connection[]) => {
  const visited = new Set<string>();
  const stack = [potentialAncestorId];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === potentialDescendantId) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    conns.filter(c => c.sourceId === node).forEach(c => stack.push(c.targetId));
  }
  return false;
};

const isInsideTileExclusion = (p: Point, tiles: CanvasItem[], startPoint: Point, endPoint: Point) => {
  // Allow path to start and end at the ports
  if ((Math.abs(p.x - startPoint.x) < 5 && Math.abs(p.y - startPoint.y) < 5) ||
      (Math.abs(p.x - endPoint.x) < 5 && Math.abs(p.y - endPoint.y) < 5)) {
    return false;
  }

  for (const tile of tiles) {
    // Node bounds in canvas space (y-56)
    const left = tile.x - 4, right = tile.x + 36;
    const top = (tile.y - 56) - 4, bottom = (tile.y - 56) + 36;
    if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) return true;
  }
  return false;
};

const generateRoundedPath = (points: Point[]) => {
  if (points.length < 2) return '';
  const radius = 8;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1], curr = points[i], next = points[i + 1];
    if (next) {
      const d1 = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
      const d2 = Math.sqrt(Math.pow(next.x - curr.x, 2) + Math.pow(next.y - curr.y, 2));
      const r = Math.min(radius, d1 / 2, d2 / 2);
      if (r < 1) {
        d += ` L ${curr.x} ${curr.y}`;
        continue;
      }
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
  sX: number, sY: number, 
  tX: number, tY: number, 
  sourceSide: string, targetSide: string, 
  sourceId: string, targetId: string, 
  tiles: CanvasItem[],
  allConnections: Connection[] = []
) => {
  const start = { x: sX, y: sY }, end = { x: tX, y: tY };
  const isRecursion = isAncestor(targetId, sourceId, allConnections);

  // v7.0 Directional Projection
  let sDir = { x: 0, y: 0 };
  if (sourceSide === 'right') sDir.x = 1; 
  else if (sourceSide === 'left') sDir.x = -1; 
  else if (sourceSide === 'bottom') sDir.y = 1; 
  else if (sourceSide === 'top') sDir.y = -1;
  
  const projectedStart = { x: start.x + sDir.x * 16, y: start.y + sDir.y * 16 };
  const firstGridPoint = { x: snapToGrid(projectedStart.x, 16), y: snapToGrid(projectedStart.y, 16) };

  // Heuristic: Manhattan distance
  const getH = (p: Point) => Math.abs(p.x - end.x) + Math.abs(p.y - end.y);

  const openSet: AStarNode[] = [{ 
    ...firstGridPoint, 
    g: 0, 
    f: getH(firstGridPoint), 
    parent: null, 
    direction: sDir 
  }];
  const closedSet = new Set<string>();
  let finalNode: AStarNode | null = null, iterations = 0;
  const maxIterations = isRecursion ? 1500 : 800;

  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++;
    openSet.sort((a, b) => a.f - b.f);
    const curr = openSet.shift()!;
    const key = `${curr.x},${curr.y}`;
    
    // Target proximity detection
    if (Math.abs(curr.x - end.x) < 20 && Math.abs(curr.y - end.y) < 20) { 
      finalNode = curr; 
      break; 
    }
    
    if (closedSet.has(key)) continue;
    closedSet.add(key);

    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    for (const d of dirs) {
      // Prevent immediate backtracking
      if (curr.direction && d.x === -curr.direction.x && d.y === -curr.direction.y) continue;
      
      const n = { x: curr.x + d.x * GRID_SIZE, y: curr.y + d.y * GRID_SIZE };
      const nKey = `${n.x},${n.y}`;
      if (closedSet.has(nKey)) continue;

      // Solid Obstacle Avoidance
      const isBlocked = isInsideTileExclusion(n, tiles, start, end);
      if (isBlocked && !isRecursion) continue; 
      
      const obstacleCost = isBlocked ? OBSTACLE_PENALTY : 0;
      const turnCost = (curr.direction && (d.x !== curr.direction.x || d.y !== curr.direction.y)) ? TURN_PENALTY : 0;
      
      // Smart Congestion Awareness (Pseudo-parallel avoidance)
      // If we are recursion, we strongly avoid the grid's main y-trunk
      const recursionPenalty = (isRecursion && Math.abs(n.x - snapToGrid(start.x, 16)) < 64) ? 400 : 0;

      const g = curr.g + GRID_SIZE + turnCost + obstacleCost + recursionPenalty;
      const f = g + getH(n);
      openSet.push({ ...n, g, f, parent: curr, direction: d });
    }
  }

  const pathPoints: Point[] = [start];
  if (finalNode) {
    let curr: AStarNode | null = finalNode;
    const temp: Point[] = [];
    while (curr) { 
      temp.unshift({ x: curr.x, y: curr.y }); 
      curr = curr.parent; 
    }
    pathPoints.push(...temp);
  }
  pathPoints.push(end);

  const midIdx = Math.floor(pathPoints.length / 2);
  const mid = pathPoints[midIdx] || { x: (sX + tX) / 2, y: (sY + tY) / 2 };

  return { d: generateRoundedPath(pathPoints), mid };
};
