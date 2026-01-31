
/**
 * Obstacle-Aware Lane-Progressive Routing
 * Navigates around node bodies (32x32 tiles) to ensure paths run in the lanes.
 * Specifically handles recursion by calculating clear exit/entry vectors.
 */
export const getSmartPath = (sX: number, sY: number, tX: number, tY: number, sourceSide: string, targetSide: string) => {
    const clearance = 24; // Ensure we clear the 32x32 body (16px radius + 8px buffer)
    
    // 1. Calculate Exit Point (Away from source node)
    let p1X = sX, p1Y = sY;
    if (sourceSide === 'right') p1X += clearance;
    else if (sourceSide === 'left') p1X -= clearance;
    else if (sourceSide === 'bottom') p1Y += clearance;
    else if (sourceSide === 'top') p1Y -= clearance;

    // 2. Calculate Entry Point (Approaching target node)
    let p4X = tX, p4Y = tY;
    if (targetSide === 'right') p4X += clearance;
    else if (targetSide === 'left') p4X -= clearance;
    else if (targetSide === 'bottom') p4Y += clearance;
    else if (targetSide === 'top') p4Y -= clearance;

    let points = [[sX, sY], [p1X, p1Y]];

    const isSrcHoriz = (sourceSide === 'left' || sourceSide === 'right');
    const isTgtHoriz = (targetSide === 'left' || targetSide === 'right');

    // 3. Calculate Midpoints
    if (isSrcHoriz && isTgtHoriz) {
        // Both sides are horizontal (left/right) - Use a vertical mid-segment
        const midX = (p1X + p4X) / 2;
        points.push([midX, p1Y], [midX, p4Y]);
    } else if (!isSrcHoriz && !isTgtHoriz) {
        // Both sides are vertical (top/bottom) - Use a horizontal mid-segment
        const midY = (p1Y + p4Y) / 2;
        points.push([p1X, midY], [p4X, midY]);
    } else {
        // Elbow turn (One horiz, one vert)
        if (isSrcHoriz) {
            points.push([p4X, p1Y]);
        } else {
            points.push([p1X, p4Y]);
        }
    }

    points.push([p4X, p4Y], [tX, tY]);

    // Remove redundant consecutive points
    const filteredPoints = points.filter((p, i) => {
        if (i === 0) return true;
        return p[0] !== points[i-1][0] || p[1] !== points[i-1][1];
    });

    return filteredPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
};

export const snapToGrid = (val: number, offset = 0, gridSize = 32) => 
  Math.round((val - offset) / gridSize) * gridSize + offset;
