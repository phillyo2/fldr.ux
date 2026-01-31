/**
 * Strict Manhattan Routing Engine with Rounded Corner Smoothing
 * 
 * Logic:
 * 1. Calculate strict Manhattan points.
 * 2. Enforce shared coordinates to prevent diagonals.
 * 3. Generate SVG path string with quadratic Bézier curves at elbows for smoothness.
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
    const laneSize = 24; // Distance from port into the grid lane before turning
    
    // 1. Initial points
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

    const isSrcHoriz = (sourceSide === 'left' || sourceSide === 'right');
    const isTgtHoriz = (targetSide === 'left' || targetSide === 'right');

    let points = [[sX, sY]];

    // 2. Routing logic
    const isRecursive = (p1Y > p4Y && targetSide === 'top');
    
    if (isRecursive) {
        // Backwards loop logic
        const swingX = Math.max(p1X, p4X) + 64;
        points.push([p1X, p1Y], [swingX, p1Y], [swingX, p4Y], [p4X, p4Y]);
    } else {
        if (isSrcHoriz && isTgtHoriz) {
            const midX = (p1X + p4X) / 2;
            points.push([p1X, p1Y], [midX, p1Y], [midX, p4Y], [p4X, p4Y]);
        } else if (!isSrcHoriz && !isTgtHoriz) {
            const midY = (p1Y + p4Y) / 2;
            points.push([p1X, midY], [p4X, midY]);
        } else {
            const clipsNode = Math.abs(p4X - sX) < 24 && Math.abs(p1Y - sY) < 24;
            if (clipsNode) {
                const bypassY = p1Y + (p4Y > p1Y ? 48 : -48);
                points.push([p1X, p1Y], [p1X, bypassY], [p4X, bypassY], [p4X, p4Y]);
            } else {
                points.push([p1X, p1Y], [p4X, p1Y], [p4X, p4Y]);
            }
        }
    }

    points.push([tX, tY]);

    // 3. Enforce strict Manhattan (prevent diagonals)
    const strictPoints: number[][] = [];
    points.forEach((p, i) => {
        if (i === 0) {
            strictPoints.push(p);
            return;
        }
        const prev = strictPoints[strictPoints.length - 1];
        if (p[0] !== prev[0] && p[1] !== prev[1]) {
            // Prefer turning based on exit direction
            if (isSrcHoriz) strictPoints.push([p[0], prev[1]]);
            else strictPoints.push([prev[0], p[1]]);
        }
        strictPoints.push(p);
    });

    // Clean duplicates
    const finalPoints = strictPoints.filter((p, i) => {
        if (i === 0) return true;
        return p[0] !== strictPoints[i-1][0] || p[1] !== strictPoints[i-1][1];
    });

    // 4. Rounded corners SVG generation
    const radius = 8;
    let d = `M ${finalPoints[0][0]} ${finalPoints[0][1]}`;

    for (let i = 1; i < finalPoints.length; i++) {
        const prev = finalPoints[i - 1];
        const curr = finalPoints[i];
        const next = finalPoints[i + 1];

        if (next) {
            // Distance to next elbow
            const d1 = Math.sqrt(Math.pow(curr[0] - prev[0], 2) + Math.pow(curr[1] - prev[1], 2));
            const d2 = Math.sqrt(Math.pow(next[0] - curr[0], 2) + Math.pow(next[1] - curr[1], 2));
            const r = Math.min(radius, d1 / 2, d2 / 2);

            // Vector to curr from prev
            const v1 = [(curr[0] - prev[0]) / d1, (curr[1] - prev[1]) / d1];
            // Vector to next from curr
            const v2 = [(next[0] - curr[0]) / d2, (next[1] - curr[1]) / d2];

            // Point before corner
            const pStart = [curr[0] - v1[0] * r, curr[1] - v1[1] * r];
            // Point after corner
            const pEnd = [curr[0] + v2[0] * r, curr[1] + v2[1] * r];

            d += ` L ${pStart[0]} ${pStart[1]} Q ${curr[0]} ${curr[1]} ${pEnd[0]} ${pEnd[1]}`;
        } else {
            d += ` L ${curr[0]} ${curr[1]}`;
        }
    }

    return d;
};
