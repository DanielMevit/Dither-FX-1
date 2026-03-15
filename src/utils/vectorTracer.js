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
 * @returns {Array<{points: Array<{x:number, y:number}>, closed: boolean}>}
 */
export function traceToVectorPaths(pixels, width, height, components, threshold = 128, simplifyEpsilon = 2.0) {
    // Step 1: Convert to 1-bit binary grid
    const grid = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * components;
            const lum = 0.2126 * pixels[idx] + 0.7152 * pixels[idx + 1] + 0.0722 * pixels[idx + 2];
            grid[y * width + x] = lum >= threshold ? 1 : 0;
        }
    }

    // Step 2: Marching squares contour detection
    const contours = marchingSquares(grid, width, height);

    // Step 3: Simplify paths
    const simplified = contours.map(contour => ({
        points: simplifyPath(contour.points, simplifyEpsilon),
        closed: contour.closed
    }));

    // Filter out degenerate paths
    return simplified.filter(c => c.points.length >= 3);
}

/**
 * Marching squares algorithm
 * Returns array of contour polylines
 */
function marchingSquares(grid, width, height) {
    const visited = new Set();
    const contours = [];

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
        for (let x = 0; x < width - 1; x++) {
            const cellCase = getCase(x, y);
            if (cellCase === 0 || cellCase === 15) continue;

            const key = `${x},${y}`;
            if (visited.has(key)) continue;

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
    const maxSteps = (width + height) * 4;
    let steps = 0;

    do {
        const key = `${x},${y}`;
        visited.add(key);

        const cellCase = getCase(x, y);
        const point = getCellPoint(x, y, cellCase);
        if (point) {
            points.push(point);
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
 * Get the interpolated point for a marching squares cell
 */
function getCellPoint(x, y, cellCase) {
    // Return a point on the edge of the cell based on the case
    switch (cellCase) {
        case 1: case 14: return { x: x, y: y + 0.5 };
        case 2: case 13: return { x: x + 0.5, y: y + 1 };
        case 3: case 12: return { x: x, y: y + 0.5 };
        case 4: case 11: return { x: x + 1, y: y + 0.5 };
        case 5: return { x: x + 0.5, y: y };
        case 6: case 9: return { x: x + 0.5, y: y };
        case 7: case 8: return { x: x, y: y + 0.5 };
        case 10: return { x: x + 0.5, y: y + 1 };
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
 * Ramer-Douglas-Peucker path simplification
 * Reduces point count while preserving shape
 */
function simplifyPath(points, epsilon) {
    if (points.length <= 2) return points;

    // Find the point with maximum distance from the line segment
    let maxDist = 0;
    let maxIdx = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
        const dist = pointToLineDistance(points[i], first, last);
        if (dist > maxDist) {
            maxDist = dist;
            maxIdx = i;
        }
    }

    if (maxDist > epsilon) {
        const left = simplifyPath(points.slice(0, maxIdx + 1), epsilon);
        const right = simplifyPath(points.slice(maxIdx), epsilon);
        return [...left.slice(0, -1), ...right];
    }

    return [first, last];
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
