
export type NodeType = 'trigger' | 'action' | 'logic';

export interface LatchPoint {
  id: string;
  x: number;
  y: number;
  color: string;
  pair: string;
  axis: 'vertical' | 'horizontal';
  type: 'input' | 'flow' | 'peek';
}

export interface CanvasItem {
  instanceId: string;
  name: string;
  icon: string;
  x: number;
  y: number;
  isRegistered: boolean;
  isOrigin?: boolean;
  isBuilder?: boolean;
  isTrigger?: boolean;
  setup?: string;
  payload?: string;
  logic?: string;
  deployedData?: Record<string, any>;
  color?: string;
}

export interface Connection {
  id: string;
  sourceId: string;
  sourceSide: string;
  targetId: string;
  targetSide: string;
  color: string;
  displayColor?: string;
  snapX?: number;
  snapY?: number;
  waypoint?: { x: number; y: number };
}

export interface FolderData {
  id: string;
  title: string;
  icon: string;
  color: string;
  items: Partial<CanvasItem>[];
}
