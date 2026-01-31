
/**
 * Obstacle-Aware Lane-Progressive Routing
 * Navigates around node bodies (32x32 tiles) to ensure paths run in the lanes.
 */
export const getSmartPath = (sX: number, sY: number, tX: number, tY: number, sourceSide: string, targetSide: string) => {
    const lane = 16; 
    const margin = 8; // Extra padding to clear the tile body
    
    // Calculate initial exit points based on side
    let exitX = sX, exitY = sY;
    if (sourceSide === 'right') exitX += (lane + margin);
    else if (sourceSide === 'left') exitX -= (lane + margin);
    else if (sourceSide === 'bottom') exitY += (lane + margin);
    else if (sourceSide === 'top') exitY -= (lane + margin);

    // Calculate final entry points based on side
    let entryX = tX, entryY = tY;
    if (targetSide === 'right') entryX += (lane + margin);
    else if (targetSide === 'left') entryX -= (lane + margin);
    else if (targetSide === 'bottom') entryY += (lane + margin);
    else if (targetSide === 'top') entryY -= (lane + margin);

    let points = [[sX, sY], [exitX, exitY]];

    const isHorizontalExit = (sourceSide === 'left' || sourceSide === 'right');
    const isHorizontalEntry = (targetSide === 'left' || targetSide === 'right');

    if (isHorizontalExit && isHorizontalEntry) {
        // Both sides are horizontal (left/right)
        const midX = (exitX + entryX) / 2;
        points.push([midX, exitY], [midX, entryY]);
    } else if (!isHorizontalExit && !isHorizontalEntry) {
        // Both sides are vertical (top/bottom)
        const midY = (exitY + entryY) / 2;
        points.push([exitX, midY], [entryX, midY]);
    } else {
        // One is horizontal, one is vertical (elbow turn)
        if (isHorizontalExit) {
            points.push([entryX, exitY]);
        } else {
            points.push([exitX, entryY]);
        }
    }

    points.push([entryX, entryY], [tX, tY]);

    // Clean up duplicate consecutive points
    const filteredPoints = points.filter((p, i) => {
        if (i === 0) return true;
        return p[0] !== points[i-1][0] || p[1] !== points[i-1][1];
    });

    return filteredPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
};

export const snapToGrid = (val: number, offset = 0, gridSize = 32) => 
  Math.round((val - offset) / gridSize) * gridSize + offset;
