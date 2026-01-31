/**
 * 3D-Slice Kinematic Pathing Engine
 * 
 * Logic:
 * 1. Calculate Port and Lane-Entry points.
 * 2. Identify "Physical Obstacles" (Source and Target Node bodies).
 * 3. Use Manhattan routing with collision-detection.
 * 4. Apply "Depth Offset" (3D Slice) to prevent perfect overlap in shared lanes.
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
    const hash = connId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const depthOffset = (hash % 3) * 4 - 4; // Yields -4, 0, or 4

    const nodeSize = 32;
    const laneSize = 16; // Half a grid cell to get into the mid-lane

    // 1. Calculate Exit/Entry points (Moving into the lanes)
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

    // Apply 3D Slice depth offset to the lane segments
    const isSrcHoriz = (sourceSide === 'left' || sourceSide === 'right');
    const isTgtHoriz = (targetSide === 'left' || targetSide === 'right');

    if (isSrcHoriz) p1Y += depthOffset; else p1X += depthOffset;
    if (isTgtHoriz) p4Y += depthOffset; else p4X += depthOffset;

    let points = [[sX, sY], [p1X, p1Y]];

    // 2. Obstacle Avoidance Math
    // We define the "danger zone" as the bounding box of the source and target nodes.
    // Nodes are centered on (sX, sY) depending on the port, but essentially 
    // we need to check if a straight line from p1 to p4 intersects the node bodies.

    const isRecursive = (p1Y > p4Y && targetSide === 'top');
    
    if (isRecursive) {
        // Logic for "Backwards Loop" (Recursion)
        // Must wrap around the side to avoid clipping through the source/target
        const wrapX = Math.max(p1X, p4X) + 48; // Swing out wide
        points.push([wrapX, p1Y], [wrapX, p4Y], [p4X, p4Y]);
    } else {
        // Standard Manhattan routing with elbow turn
        if (isSrcHoriz && isTgtHoriz) {
            const midX = (p1X + p4X) / 2;
            points.push([midX, p1Y], [midX, p4Y]);
        } else if (!isSrcHoriz && !isTgtHoriz) {
            const midY = (p1Y + p4Y) / 2;
            points.push([p1X, midY], [p4X, midY]);
        } else {
            // Mixed sides - avoid the 'dead corner' if it clips a node
            if (isSrcHoriz) {
                // Check if the elbow point [p4X, p1Y] is too close to source or target
                const clipsSource = Math.abs(p4X - sX) < 16 && Math.abs(p1Y - sY) < 16;
                if (clipsSource) {
                    const bypassY = p1Y + (p4Y > p1Y ? 48 : -48);
                    points.push([p1X, bypassY], [p4X, bypassY]);
                } else {
                    points.push([p4X, p1Y]);
                }
            } else {
                points.push([p1X, p4Y]);
            }
        }
    }

    points.push([p4X, p4Y], [tX, tY]);

    // Clean up duplicate points
    const filteredPoints = points.filter((p, i) => {
        if (i === 0) return true;
        return p[0] !== points[i-1][0] || p[1] !== points[i-1][1];
    });

    return filteredPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
};
