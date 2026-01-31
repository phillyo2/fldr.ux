export type NodeType = 'trigger' | 'action' | 'logic';

export interface LogicPort {
  id: string;
  name: string;
  type: string;
  direction: 'input' | 'output';
}

export interface LogicNode {
  id: string;
  type: NodeType;
  label: string;
  icon?: string;
  position: { x: number; y: number };
  inputs: LogicPort[];
  outputs: LogicPort[];
  properties: Record<string, any>;
  customCode?: string;
  payloadSchema?: string;
}

export interface LogicConnection {
  id: string;
  sourceId: string;
  sourcePortId: string;
  targetId: string;
  targetPortId: string;
}

export interface LogicFlow {
  nodes: LogicNode[];
  connections: LogicConnection[];
}
