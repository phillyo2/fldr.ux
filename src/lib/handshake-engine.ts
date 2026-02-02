import { CanvasItem, Connection } from './types';
import { LATCH_POINTS, DETECTION_RANGE } from './constants';
import { isAncestor } from './pathing';

/**
 * Handshake Engine v1.7 [Vibrant Signal Protocol]
 * 
 * - Orange (orange-500): Trigger connections.
 * - Purple (fuchsia-500): Data Provider connections.
 * - Gray (slate-300): Ambiguous Placeholder docking.
 * - Blue (blue-500): Standard Top-Input flow.
 * - Yellow (amber-400): Parallel/Peek Left-Input.
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
      // Trigger/DataProvider Isolation: Only Bottom allowed for output
      if ((dragNode.isTrigger || dragNode.isDataProvider) && lSource.id !== 'bottom') return;

      const isOutputAnchor = lSource.id === 'bottom' || lSource.id === 'right';
      
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

          // SPECIAL UPSTREAM CASES: To Entry Point Top
          if (other.isOrigin && lSource.id === 'bottom' && lTarget.id === 'top') {
            if (dragNode.isTrigger) {
              valid = true;
              color = 'orange-500'; // Vibrant Orange for Trigger
            } else if (dragNode.isDataProvider) {
              valid = true;
              color = 'fuchsia-500'; // Purple for Data
            } else if (!dragNode.isRegistered) {
              valid = true;
              color = 'slate-300'; // Gray for Ambiguous Placeholder
            }
          } 
          // STANDARD FLOW
          else if (!dragNode.isTrigger && !dragNode.isDataProvider && !other.isTrigger && !other.isDataProvider) {
             const otherCtx = getTreeContext(other.instanceId, connections);
             if (!dragCtx && otherCtx && lTarget.id === 'top' && lSource.id === 'bottom') {
               const dragHasAnyConnection = connections.some(c => c.sourceId === dId || c.targetId === dId);
               if (!dragHasAnyConnection) { valid = true; color = 'blue-500'; }
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

      // Inverted case: other is the source
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

          if (dragNode.isOrigin && lSource.id === 'bottom' && lTarget.id === 'top') {
            if (other.isTrigger) {
              valid = true;
              color = 'orange-500';
            } else if (other.isDataProvider) {
              valid = true;
              color = 'fuchsia-500';
            } else if (!other.isRegistered) {
              valid = true;
              color = 'slate-300';
            }
          }
          else if (!other.isTrigger && !other.isDataProvider && !dragNode.isTrigger && !dragNode.isDataProvider) {
            const otherCtx = getTreeContext(other.instanceId, connections);
            if (otherCtx && !dragCtx && lSource.id !== 'top') {
              const dragHasAnyConnection = connections.some(c => c.sourceId === dId || c.targetId === dId);
              if (!dragHasAnyConnection) valid = true;
            }
            if (!otherCtx && dragCtx && lTarget.id === 'top' && lSource.id === 'bottom') {
               const otherHasAnyConnection = connections.some(c => c.sourceId === other.instanceId || c.targetId === other.instanceId);
               if (!otherHasAnyConnection) { valid = true; color = 'blue-500'; }
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
  // Trigger/DataProvider Isolation: Disallow Blue, Yellow, Red ports for Triggers
  if ((item.isTrigger || item.isDataProvider) && lp.id !== 'bottom') {
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
      const isVibrantOrange = connections.some(c => c.sourceId === item.instanceId && c.sourceSide === 'bottom' && c.color.includes('orange-500'));
      const activeIsVibrantOrange = activeTether && activeTether.sourceId === item.instanceId && activeTether.sourceSide === 'bottom' && activeTether.color.includes('orange-500');
      const isFuchsia = connections.some(c => c.sourceId === item.instanceId && c.sourceSide === 'bottom' && c.color.includes('fuchsia-500'));
      const activeIsFuchsia = activeTether && activeTether.sourceId === item.instanceId && activeTether.sourceSide === 'bottom' && activeTether.color.includes('fuchsia-500');
      const isGray = connections.some(c => c.sourceId === item.instanceId && c.sourceSide === 'bottom' && c.color.includes('slate-300'));
      const activeIsGray = activeTether && activeTether.sourceId === item.instanceId && activeTether.sourceSide === 'bottom' && activeTether.color.includes('slate-300');
      
      if (isVibrantOrange || activeIsVibrantOrange) dotColor = 'bg-orange-500';
      else if (isFuchsia || activeIsFuchsia) dotColor = 'bg-fuchsia-500';
      else if (isGray || activeIsGray) dotColor = 'bg-slate-300';
      else dotColor = 'bg-emerald-500';
    }
    else if (lp.id === 'right') dotColor = 'bg-rose-500';
    else if (lp.id === 'left') dotColor = 'bg-amber-400';
    else {
      // Top Port Illumination
      const isFuchsiaInput = connections.some(c => c.targetId === item.instanceId && c.targetSide === 'top' && c.color.includes('fuchsia-500'));
      const activeIsFuchsiaInput = activeTether && activeTether.targetId === item.instanceId && activeTether.targetSide === 'top' && activeTether.color.includes('fuchsia-500');
      const isVibrantOrangeInput = connections.some(c => c.targetId === item.instanceId && c.targetSide === 'top' && c.color.includes('orange-500'));
      const activeIsVibrantOrangeInput = activeTether && activeTether.targetId === item.instanceId && activeTether.targetSide === 'top' && activeTether.color.includes('orange-500');
      const isGrayInput = connections.some(c => c.targetId === item.instanceId && c.targetSide === 'top' && c.color.includes('slate-300'));
      const activeIsGrayInput = activeTether && activeTether.targetId === item.instanceId && activeTether.targetSide === 'top' && activeTether.color.includes('slate-300');
      
      if (isVibrantOrangeInput || activeIsVibrantOrangeInput) dotColor = 'bg-orange-500';
      else if (isFuchsiaInput || activeIsFuchsiaInput) dotColor = 'bg-fuchsia-500';
      else if (isGrayInput || activeIsGrayInput) dotColor = 'bg-slate-300';
      else dotColor = 'bg-blue-500';
    }
  }

  return { dotColor, isActive };
};
