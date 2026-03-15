/**
 * Vector Tracer Module
 * Converts 1-bit dithered output to vector paths using marching squares
 */

/**
 * Trace pixel data to vector path contours
 * @param {Uint8Array} pixels - Pixel data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} components - Color components (3 or 4)
 * @param {number} threshold - Luminance threshold for black/white (0-255)
 * @param {number} simplifyEpsilon - Path simplification tolerance (0.5-10)
 * @param {Object} [abortSignal] - { aborted: boolean } to cancel mid-trace
 * @returns {Array<{points: Array<{x:number, y:number}>, closed: boolean}>}
 */
export function traceToVectorPaths(pixels, width, height, components, threshold = 128, simplifyEpsilon = 2.0, abortSignal) {
    // Step 1: Convert to 1-bit binary grid
    const grid = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * components;
            const lum = 0.2126 * pixels[idx] + 0.7152 * pixels[idx + 1] + 0.0722 * pixels[idx + 2];
            grid[y * width + x] = lum >= threshold ? 1 : 0;
        }
    }

    if (abortSignal?.aborted) return [];

    // Step 2: Marching squares contour detection
    const contours = marchingSquares(grid, width, height, abortSignal);

    if (abortSignal?.aborted) return [];

    // Step 3: Simplify paths and filter
    const result = [];
    for (const contour of contours) {
        if (abortSignal?.aborted) return [];
        const simplified = simplifyPath(contour.points, simplifyEpsilon);
        if (simplified.length >= 3) {
            result.push({ points: simplified, closed: contour.closed });
        }
    }

    return result;
}

/**
 * Marching squares algorithm
 * Returns array of contour polylines
 */
function marchingSquares(grid, width, height, abortSignal) {
    // Use a flat Uint8Array for visited tracking instead of Set with string keys
    const visited = new Uint8Array(width * height);
    const contours = [];
    const MAX_CONTOURS = 200;

    // Helper to get grid value with boundary check
    function getVal(x, y) {
        if (x < 0 || x >= width || y < 0 || y >= height) return 0;
        return grid[y * width + x];
    }

    // Compute marching squares case for a 2x2 cell at (x, y)
    function getCase(x, y) {
        return (getVal(x, y) << 3) |
               (getVal(x + 1, y) << 2) |
               (getVal(x + 1, y + 1) << 1) |
               (getVal(x, y + 1));
    }

    // Find contour edges using marching squares
    for (let y = 0; y < height - 1; y++) {
        if (abortSignal?.aborted) return contours;
        for (let x = 0; x < width - 1; x++) {
            if (contours.length >= MAX_CONTOURS) return contours;

            const cellCase = getCase(x, y);
            if (cellCase === 0 || cellCase === 15) continue;

            if (visited[y * width + x]) continue;

            // Trace contour starting from this cell
            const points = traceContour(x, y, getCase, visited, width, height);
            if (points.length >= 3) {
                contours.push({ points, closed: true });
            }
        }
    }

    return contours;
}

/**
 * Trace a single contour from a starting cell
 */
function traceContour(startX, startY, getCase, visited, width, height) {
    const points = [];
    let x = startX;
    let y = startY;
    let prevDir = -1;
    // Limit steps to prevent infinite loops
    const maxSteps = Math.min((width + height) * 4, 50000);
    let steps = 0;

    do {
        visited[y * width + x] = 1;

        const cellCase = getCase(x, y);

        // Get the two edge-crossing points for this cell case
        const edgePoints = getCellEdgePoints(x, y, cellCase);
        if (edgePoints) {
            for (const p of edgePoints) {
                // Avoid adding duplicate consecutive points
                const last = points[points.length - 1];
                if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) {
                    points.push(p);
                }
            }
        }

        // Determine next cell based on case
        const dir = getDirection(cellCase, prevDir);
        if (dir === null) break;

        prevDir = dir;
        switch (dir) {
            case 0: x++; break;  // right
            case 1: y++; break;  // down
            case 2: x--; break;  // left
            case 3: y--; break;  // up
        }

        steps++;
        if (steps > maxSteps) break;
        if (x < 0 || x >= width - 1 || y < 0 || y >= height - 1) break;
    } while (x !== startX || y !== startY);

    return points;
}

/**
 * Get edge-crossing point(s) for a marching squares cell.
 * Returns array of 1 point on the contour edge for this cell.
 * Points are placed at the midpoint of the edge being crossed.
 *
 * Cell corners:  TL(x,y)----TR(x+1,y)
 *                  |            |
 *                BL(x,y+1)--BR(x+1,y+1)
 *
 * Edges: Top=(x+0.5, y), Right=(x+1, y+0.5), Bottom=(x+0.5, y+1), Left=(x, y+0.5)
 */
function getCellEdgePoints(x, y, cellCase) {
    const top    = { x: x + 0.5, y: y };
    const right  = { x: x + 1,   y: y + 0.5 };
    const bottom = { x: x + 0.5, y: y + 1 };
    const left   = { x: x,       y: y + 0.5 };

    // Each case crosses specific edges. Return the entry point for the contour direction.
    switch (cellCase) {
        case 1:  return [left];      // BL only
        case 2:  return [bottom];    // BR only
        case 3:  return [left];      // BL+BR → left to bottom
        case 4:  return [right];     // TR only
        case 5:  return [top, left]; // saddle TL+BR empty
        case 6:  return [right];     // TR+BR → right to bottom
        case 7:  return [left];      // only TL empty
        case 8:  return [top];       // TL only
        case 9:  return [top];       // TL+BL → top to left
        case 10: return [bottom, top]; // saddle TR+BL empty
        case 11: return [top];       // only TR empty
        case 12: return [right];     // TL+TR → top to right
        case 13: return [bottom];    // only BL empty
        case 14: return [right];     // only BR empty
        default: return null;
    }
}

/**
 * Get direction to next cell based on marching squares case
 */
function getDirection(cellCase, prevDir) {
    // Direction: 0=right, 1=down, 2=left, 3=up
    switch (cellCase) {
        case 1: return 2;
        case 2: return 1;
        case 3: return 2;
        case 4: return 0;
        case 5: return prevDir === 1 ? 2 : 0;  // saddle
        case 6: return 1;
        case 7: return 2;
        case 8: return 3;
        case 9: return 3;
        case 10: return prevDir === 0 ? 1 : 3;  // saddle
        case 11: return 0;
        case 12: return 3;
        case 13: return 1;
        case 14: return 0;
        default: return null;
    }
}

/**
 * Ramer-Douglas-Peucker path simplification (iterative to avoid stack overflow)
 * Reduces point count while preserving shape
 */
function simplifyPath(points, epsilon) {
    if (points.length <= 2) return points;

    const keep = new Uint8Array(points.length);
    keep[0] = 1;
    keep[points.length - 1] = 1;

    // Iterative stack-based RDP
    const stack = [[0, points.length - 1]];

    while (stack.length > 0) {
        const [start, end] = stack.pop();
        if (end - start < 2) continue;

        let maxDist = 0;
        let maxIdx = start;
        const first = points[start];
        const last = points[end];

        for (let i = start + 1; i < end; i++) {
            const dist = pointToLineDistance(points[i], first, last);
            if (dist > maxDist) {
                maxDist = dist;
                maxIdx = i;
            }
        }

        if (maxDist > epsilon) {
            keep[maxIdx] = 1;
            stack.push([start, maxIdx]);
            stack.push([maxIdx, end]);
        }
    }

    const result = [];
    for (let i = 0; i < points.length; i++) {
        if (keep[i]) result.push(points[i]);
    }
    return result;
}

/**
 * Perpendicular distance from point to line segment
 */
function pointToLineDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
        const ex = point.x - lineStart.x;
        const ey = point.y - lineStart.y;
        return Math.sqrt(ex * ex + ey * ey);
    }

    const num = Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
    return num / Math.sqrt(lenSq);
}
