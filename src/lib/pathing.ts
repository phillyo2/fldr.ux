/**
 * Obstacle-Aware Lane-Progressive Routing
 * Navigates around node bodies (32x32 tiles) to ensure paths run in the lanes.
 * Specifically handles recursion by calculating clear exit/entry vectors that bypass node bodies.
 */
export const getSmartPath = (sX: number, sY: number, tX: number, tY: number, sourceSide: string, targetSide: string) => {
    // The nodes are 32x32. Ports are at the edges. 
    // Lanes are exactly between nodes, offset by 16px from the center.
    const laneOffset = 16; 
    
    // 1. Calculate Exit Point (Moving into the lane)
    let p1X = sX, p1Y = sY;
    if (sourceSide === 'right') p1X += laneOffset;
    else if (sourceSide === 'left') p1X -= laneOffset;
    else if (sourceSide === 'bottom') p1Y += laneOffset;
    else if (sourceSide === 'top') p1Y -= laneOffset;

    // 2. Calculate Entry Point (Approaching target from the lane)
    let p4X = tX, p4Y = tY;
    if (targetSide === 'right') p4X += laneOffset;
    else if (targetSide === 'left') p4X -= laneOffset;
    else if (targetSide === 'bottom') p4Y += laneOffset;
    else if (targetSide === 'top') p4Y -= laneOffset;

    let points = [[sX, sY], [p1X, p1Y]];

    // 3. Logic for Recursive Wrapping
    // If we are looping "backwards" (target Y is less than source Y) and connecting to a 'top' port, 
    // we need to wrap around the side to avoid passing through the node.
    const isBackwards = p1Y > p4Y;
    const isTargetTop = targetSide === 'top';
    const isSourceBottom = sourceSide === 'bottom';

    if (isBackwards && isTargetTop && isSourceBottom) {
        // Recursive wrap-around
        const wrapX = Math.max(p1X, p4X) + 32;
        points.push([p1X, p1Y], [wrapX, p1Y], [wrapX, p4Y], [p4X, p4Y]);
    } else {
        const isSrcHoriz = (sourceSide === 'left' || sourceSide === 'right');
        const isTgtHoriz = (targetSide === 'left' || targetSide === 'right');

        // Elbow turn or straight mid-segments
        if (isSrcHoriz && isTgtHoriz) {
            const midX = (p1X + p4X) / 2;
            points.push([midX, p1Y], [midX, p4Y]);
        } else if (!isSrcHoriz && !isTgtHoriz) {
            const midY = (p1Y + p4Y) / 2;
            points.push([p1X, midY], [p4X, midY]);
        } else {
            // Mixed sides (one vert, one horiz)
            if (isSrcHoriz) {
                points.push([p4X, p1Y]);
            } else {
                points.push([p1X, p4Y]);
            }
        }
    }

    points.push([p4X, p4Y], [tX, tY]);

    // Cleanup redundant points
    const filteredPoints = points.filter((p, i) => {
        if (i === 0) return true;
        return p[0] !== points[i-1][0] || p[1] !== points[i-1][1];
    });

    return filteredPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
};

export const snapToGrid = (val: number, offset = 0, gridSize = 32) => 
  Math.round((val - offset) / gridSize) * gridSize + offset;
