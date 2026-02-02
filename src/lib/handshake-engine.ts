import { CanvasItem, Connection } from './types';
import { LATCH_POINTS, DETECTION_RANGE } from './constants';
import { isAncestor } from './pathing';

/**
 * Handshake Engine v1.4
 * Pure logic for node connections, tether colors, and port states.
 * Rule enforced: Only one connection allowed per output anchor.
 * Trigger Protocol: Triggers only connect to Origins via Orange lines.
 */

export const getTreeContext = (nodeId: string, currentConnections: Connection[]): string | null => {
  const contexts = new Map<string, string>();
  const visited = new Set<string>();
  const queue: {id: string, context: string}[] = [{id: 'entry_origin', context: 'main'}];
  contexts.set('entry_origin', 'main');

  while(queue.length > 0) {
    const {id, context} = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const outgoing = currentConnections.filter(c => c.sourceId === id);
    for (const conn of outgoing) {
      contexts.set(conn.targetId, context);
      queue.push({id: conn.targetId, context: context});
    }
  }
  return contexts.get(nodeId) || null;
};

export const calculateGhostHandshakes = (
  items: CanvasItem[], 
  connections: Connection[],
  dId: string, 
  dPos: {x: number, y: number} | null = null
) => {
  const ghosts: Connection[] = [];
  const dragNode = dPos ? { ...items.find(i => i.instanceId === dId), ...dPos } : items.find(i => i.instanceId === dId);
  if (!dragNode) return ghosts;

  const dragCtx = getTreeContext(dId, connections);
  const fuchsiaProviders = new Set(connections.filter(c => c.color.includes('fuchsia')).map(c => c.sourceId));

  if (fuchsiaProviders.has(dId)) return ghosts;

  const getPortPos = (item: any, side: string) => {
    if (side === 'top') return { x: item.x + 16, y: item.y };
    if (side === 'bottom') return { x: item.x + 16, y: item.y + 32 };
    if (side === 'right') return { x: item.x + 32, y: item.y + 16 };
    if (side === 'left') return { x: item.x, y: item.y + 16 };
    return { x: item.x + 16, y: item.y + 16 };
  };

  items.forEach(other => {
    if (other.instanceId === dId) return;
    
    LATCH_POINTS.forEach(lSource => {
      // RULE: Only one connection per output anchor (bottom/right)
      const isOutputAnchor = lSource.id === 'bottom' || lSource.id === 'right';
      
      // Check normal case: Dragging node is the source
      if (isOutputAnchor && connections.some(c => c.sourceId === dId && c.sourceSide === lSource.id)) {
        // Output occupied
      } else {
        const lTarget = LATCH_POINTS.find(p => p.id === 'top')!;
        const sPos = getPortPos(dragNode, lSource.id);
        const tPos = getPortPos(other, lTarget.id);
        const dist = Math.sqrt(Math.pow(sPos.x - tPos.x, 2) + Math.pow(sPos.y - tPos.y, 2));

        if (dist < DETECTION_RANGE) {
          let color = lSource.color.replace('bg-', '');
          let valid = false;

          // TRIGGER SPECIAL CASE: Trigger (Bottom) -> Origin (Top)
          if (dragNode.isTrigger && other.isOrigin && lSource.id === 'bottom' && lTarget.id === 'top') {
            valid = true;
            color = 'amber-500'; // Orange connection
          } 
          // STANDARD FLOW
          else if (!dragNode.isTrigger && !other.isTrigger) {
             const otherCtx = getTreeContext(other.instanceId, connections);
             if (!dragCtx && otherCtx && lTarget.id === 'top' && lSource.id === 'bottom') {
               const dragHasAnyConnection = connections.some(c => c.sourceId === dId || c.targetId === dId);
               if (!dragHasAnyConnection) { valid = true; color = 'fuchsia-500'; }
             }
             else if (dragCtx && !otherCtx && lSource.id !== 'top') { valid = true; }
             else if (dragCtx && otherCtx && dragCtx === otherCtx) {
               if (isAncestor(other.instanceId, dId, connections)) {
                 if ((lSource.id === 'bottom' || lSource.id === 'right') && lTarget.id === 'top') { valid = true; color = 'blue-500'; }
               }
             }
          }

          if (valid) ghosts.push({ id: 'ghost', sourceId: dId, sourceSide: lSource.id, targetId: other.instanceId, targetSide: lTarget.id, color, dotDistance: dist } as any);
        }
      }

      // Check inverted case: Existing node (other) is the source
      if (isOutputAnchor && connections.some(c => c.sourceId === other.instanceId && c.sourceSide === lSource.id)) {
        // Output occupied
      } else {
        const lTarget = LATCH_POINTS.find(p => p.id === 'top')!;
        const sPosInv = getPortPos(other, lSource.id);
        const tPosInv = getPortPos(dragNode, lTarget.id);
        const distInv = Math.sqrt(Math.pow(sPosInv.x - tPosInv.x, 2) + Math.pow(sPosInv.y - tPosInv.y, 2));

        if (distInv < DETECTION_RANGE) {
          let color = lSource.color.replace('bg-', '');
          let valid = false;

          // TRIGGER SPECIAL CASE: Other Trigger (Bottom) -> Dragged Origin (Top)
          if (other.isTrigger && dragNode.isOrigin && lSource.id === 'bottom' && lTarget.id === 'top') {
            valid = true;
            color = 'amber-500';
          }
          // STANDARD FLOW
          else if (!other.isTrigger && !dragNode.isTrigger) {
            const otherCtx = getTreeContext(other.instanceId, connections);
            if (otherCtx && !dragCtx && lSource.id !== 'top') {
              const dragHasAnyConnection = connections.some(c => c.sourceId === dId || c.targetId === dId);
              if (!dragHasAnyConnection) valid = true;
            }
            if (!otherCtx && dragCtx && lTarget.id === 'top' && lSource.id === 'bottom') {
               const otherHasAnyConnection = connections.some(c => c.sourceId === other.instanceId || c.targetId === other.instanceId);
               if (!otherHasAnyConnection) { valid = true; color = 'fuchsia-500'; }
            }
          }

          if (valid) ghosts.push({ id: 'ghost', sourceId: other.instanceId, sourceSide: lSource.id, targetId: dId, targetSide: lTarget.id, color, dotDistance: distInv } as any);
        }
      }
    });
  });
  return ghosts.sort((a: any, b: any) => a.dotDistance - b.dotDistance);
};

export const getPortState = (
  item: CanvasItem, 
  lp: any, 
  connections: Connection[], 
  activeTether: Connection | null
) => {
  // TRIGGER PORT RESTRICTION: Triggers only have a bottom port
  if (item.isTrigger && lp.id !== 'bottom') {
    return { dotColor: 'bg-transparent', isActive: false };
  }

  const connectedAsSource = connections.find(c => c.sourceId === item.instanceId && c.sourceSide === lp.id);
  const connectedAsTarget = connections.find(c => c.targetId === item.instanceId && c.targetSide === lp.id);
  const tethered = activeTether && (
    (activeTether.sourceId === item.instanceId && activeTether.sourceSide === lp.id) || 
    (activeTether.targetId === item.instanceId && activeTether.targetSide === lp.id)
  );

  let dotColor = 'bg-slate-200';
  let isActive = false;

  if (connectedAsSource || connectedAsTarget || tethered) {
    isActive = true;
    if (lp.id === 'bottom') {
      const isOrange = connections.some(c => c.sourceId === item.instanceId && c.sourceSide === 'bottom' && c.color.includes('amber'));
      const activeIsOrange = activeTether && activeTether.sourceId === item.instanceId && activeTether.sourceSide === 'bottom' && activeTether.color.includes('amber');
      dotColor = (isOrange || activeIsOrange) ? 'bg-amber-500' : 'bg-emerald-500';
    }
    else if (lp.id === 'right') dotColor = 'bg-rose-500';
    else if (lp.id === 'left') dotColor = 'bg-amber-400';
    else {
      const isFuchsia = connections.some(c => c.targetId === item.instanceId && c.targetSide === 'top' && c.color.includes('fuchsia'));
      const activeIsFuchsia = activeTether && activeTether.targetId === item.instanceId && activeTether.targetSide === 'top' && activeTether.color.includes('fuchsia');
      const isOrangeInput = connections.some(c => c.targetId === item.instanceId && c.targetSide === 'top' && c.color.includes('amber'));
      const activeIsOrangeInput = activeTether && activeTether.targetId === item.instanceId && activeTether.targetSide === 'top' && activeTether.color.includes('amber');
      
      if (isOrangeInput || activeIsOrangeInput) dotColor = 'bg-amber-500';
      else if (isFuchsia || activeIsFuchsia) dotColor = 'bg-fuchsia-500';
      else dotColor = 'bg-blue-500';
    }
  }

  return { dotColor, isActive };
};
