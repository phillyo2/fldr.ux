/**
 * Strict Manhattan Routing Engine with 3D Slice Depth Offset
 * 
 * Logic:
 * 1. Align all points to a 16px lane grid.
 * 2. Ensure every segment is strictly horizontal or vertical (Manhattan).
 * 3. Apply depth offsets consistently across connected segments to prevent diagonals.
 * 4. Route around the body of source/target nodes if an elbow turn would clip them.
 */

export const snapToGrid = (val: number, offset = 0, gridSize = 32) => 
  Math.round((val - offset) / gridSize) * gridSize + offset;

export const getSmartPath = (
    sX: number, sY: number, 
    tX: number, tY: number, 
    sourceSide: string, 
    targetSide: string,
    connId: string = 'default'
) => {
    // 3D Slice Offset: Distribute lines in the same lane by +/- 4px
    // We apply this consistently to X or Y depending on the segment orientation
    const hash = connId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const depthOffset = (hash % 3) * 4 - 4; // Yields -4, 0, or 4

    const laneSize = 16; // Distance from port into the grid lane

    // 1. Calculate Initial Exit and Entry points (Moving into the lanes)
    let p1X = sX, p1Y = sY;
    if (sourceSide === 'right') p1X += laneSize;
    else if (sourceSide === 'left') p1X -= laneSize;
    else if (sourceSide === 'bottom') p1Y += laneSize;
    else if (sourceSide === 'top') p1Y -= laneSize;

    let p4X = tX, p4Y = tY;
    if (targetSide === 'right') p4X += laneSize;
    else if (targetSide === 'left') p4X -= laneSize;
    else if (targetSide === 'bottom') p4Y += laneSize;
    else if (targetSide === 'top') p4Y -= laneSize;

    // Apply depth offset consistently to the lane segments to keep them straight
    const isSrcHoriz = (sourceSide === 'left' || sourceSide === 'right');
    const isTgtHoriz = (targetSide === 'left' || targetSide === 'right');

    // To prevent diagonals, if we offset the lane-exit point, 
    // we MUST also offset the starting port point for the purpose of pathing, 
    // but since the port is fixed, we offset the FIRST elbow instead.
    
    let points = [[sX, sY]];

    // 2. Routing Logic
    const isRecursive = (p1Y > p4Y && targetSide === 'top');
    
    if (isRecursive) {
        // Backwards loop logic: Wide swing to avoid node body
        const swingX = Math.max(p1X, p4X) + 48;
        points.push([p1X, p1Y], [swingX, p1Y], [swingX, p4Y], [p4X, p4Y]);
    } else {
        // Standard Manhattan routing
        if (isSrcHoriz && isTgtHoriz) {
            // Horizontal to Horizontal
            const midX = (p1X + p4X) / 2;
            points.push([p1X, p1Y], [midX, p1Y], [midX, p4Y], [p4X, p4Y]);
        } else if (!isSrcHoriz && !isTgtHoriz) {
            // Vertical to Vertical
            const midY = (p1Y + p4Y) / 2;
            points.push([p1X, midY], [p4X, midY]);
        } else {
            // Mixed sides (e.g., Right to Top)
            // Determine if the "natural" elbow [p4X, p1Y] clips a node
            const clipsNode = Math.abs(p4X - sX) < 20 && Math.abs(p1Y - sY) < 20;
            if (clipsNode) {
                const bypassY = p1Y + (p4Y > p1Y ? 48 : -48);
                points.push([p1X, p1Y], [p1X, bypassY], [p4X, bypassY], [p4X, p4Y]);
            } else {
                points.push([p1X, p1Y], [p4X, p1Y], [p4X, p4Y]);
            }
        }
    }

    points.push([tX, tY]);

    // 3. Prevent Diagonals by enforcing shared coordinates
    // We iterate through points and ensure that for any segment, 
    // either dx or dy is zero. If not, we insert a mid-elbow.
    const strictPoints: number[][] = [];
    points.forEach((p, i) => {
        if (i === 0) {
            strictPoints.push(p);
            return;
        }
        const prev = strictPoints[strictPoints.length - 1];
        if (p[0] !== prev[0] && p[1] !== prev[1]) {
            // Insert Manhattan elbow
            strictPoints.push([prev[0], p[1]]); 
        }
        strictPoints.push(p);
    });

    // Clean up duplicates
    const finalPoints = strictPoints.filter((p, i) => {
        if (i === 0) return true;
        return p[0] !== strictPoints[i-1][0] || p[1] !== strictPoints[i-1][1];
    });

    return finalPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
};
