
/**
 * Lane-Progressive Routing (Avoids tile bodies)
 */
export const getSmartPath = (sX: number, sY: number, tX: number, tY: number, sourceSide: string, targetSide: string) => {
    const lane = 16; 
    let exitX = sX, exitY = sY;
    if (sourceSide === 'right') exitX += lane;
    else if (sourceSide === 'left') exitX -= lane;
    else if (sourceSide === 'bottom') exitY += lane;
    else if (sourceSide === 'top') exitY -= lane;

    let entryX = tX, entryY = tY;
    if (targetSide === 'right') entryX += lane;
    else if (targetSide === 'left') entryX -= lane;
    else if (targetSide === 'bottom') entryY += lane;
    else if (targetSide === 'top') entryY -= lane;

    let points = [[sX, sY], [exitX, exitY]];
    const isHorizontalExit = (sourceSide === 'left' || sourceSide === 'right');
    const targetIsBehind = isHorizontalExit 
        ? (sourceSide === 'right' ? tX < sX : tX > sX)
        : (sourceSide === 'bottom' ? tY < sY : tY > sY);

    if (targetIsBehind) {
        if (isHorizontalExit) {
            const bypassY = Math.abs(tY - sY) < 64 ? (tY > sY ? sY + 64 : sY - 64) : sY;
            points.push([exitX, bypassY], [entryX, bypassY]);
        } else {
            const bypassX = Math.abs(tX - sX) < 64 ? (tX > sX ? sX + 64 : sX - 64) : sX;
            points.push([bypassX, exitY], [bypassX, entryY]);
        }
    } else {
        if (isHorizontalExit) {
            const midX = (exitX + entryX) / 2;
            points.push([midX, exitY], [midX, entryY]);
        } else {
            const midY = (exitY + entryY) / 2;
            points.push([exitX, midY], [entryX, midY]);
        }
    }
    points.push([entryX, entryY], [tX, tY]);
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
};

export const snapToGrid = (val: number, offset = 0, gridSize = 32) => 
  Math.round((val - offset) / gridSize) * gridSize + offset;
