
import { LatchPoint } from './types';

export const GRID_SIZE = 32;
export const UNIT_SIZE_VAL = 32; 
export const SNAP_TOLERANCE = 24; // Magnetic latch distance
export const DETECTION_RANGE = 128; // 4 Cell Blocks for proactive port visibility
export const TETHER_DELAY = 0; // Instant handshake confirmation
export const HEADER_OFFSET = 56;
export const ICON_SIZE = 24; 
export const LONG_PRESS_MS = 150; 
export const DRAG_THRESHOLD = 5; 

export const SELECTABLE_ICONS = [
  'Terminal', 'Globe', 'Database', 'Bell', 'Send', 'Activity', 
  'Shield', 'Cpu', 'Layers', 'Shuffle', 'Clock', 'HardDrive',
  'GitBranch', 'Timer', 'Repeat'
];

export const LATCH_POINTS: LatchPoint[] = [
  { id: 'top', x: 0.5, y: 0, color: 'bg-blue-500', pair: 'bottom', axis: 'vertical', type: 'input' },      
  { id: 'bottom', x: 0.5, y: 1, color: 'bg-emerald-500', pair: 'top', axis: 'vertical', type: 'flow' }, 
  { id: 'right', x: 1, y: 0.5, color: 'bg-rose-500', pair: 'left', axis: 'horizontal', type: 'flow' },           
  { id: 'left', x: 0, y: 0.5, color: 'bg-amber-400', pair: 'right', axis: 'horizontal', type: 'peek' } 
];
