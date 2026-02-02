
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

export interface FolderItem {
  name: string;
  icon: string;
  id?: string;
  isFolder?: boolean;
  isBuilder?: boolean;
  isTrigger?: boolean;
  isDataProvider?: boolean;
  items?: FolderItem[];
  color?: string;
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
  isDataProvider?: boolean;
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
  dotDistance?: number;
}

export interface FolderData {
  id: string;
  title: string;
  icon: string;
  color: string;
  items: FolderItem[];
}
