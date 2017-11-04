"use strict";

function TransformPoints(moveSinglePoint) {

    function calcMidpoint(weighted_ctx) {
        if (weighted_ctx.mid === undefined) {
            const { weighted_vs } = weighted_ctx;
            let mx = 0;
            let my = 0;
            let count = 0;
            for (let vuid in weighted_vs) {
                const v = weighted_vs[vuid];
                if (v.weight > 0.99) {
                    mx += v.x;
                    my += v.y;
                    ++count;
                }
            }
            if (count === 0) {
                count = 1;
            }
            weighted_ctx.mid = {
                x: (mx / count),
                y: (my / count)
            };
        }
    }


    // Points translate,
    function translateWeightedPoints(weighted_ctx, dx, dy) {
        const { weighted_vs } = weighted_ctx;
        for (let vuid in weighted_vs) {
            const v = weighted_vs[vuid];
            const sx = v.x + (dx * v.weight);
            const sy = v.y + (dy * v.weight);
            moveSinglePoint(vuid, sx, sy);
        }
    }

    // Points rotate,
    function rotateWeightedPoints(weighted_ctx, sx, sy, dx, dy) {
        calcMidpoint(weighted_ctx);
        const { weighted_vs, mid } = weighted_ctx;

        const mx = mid.x;
        const my = mid.y;

        // Starting angle,
        const sa = Math.atan2(sy - my, sx - mx);
        // Current angle,
        const ca = Math.atan2((sy + dy) - my, (sx + dx) - mx);
        const ad = (ca - sa);

        for (let vuid in weighted_vs) {
            const v = weighted_vs[vuid];
            const sx = mx + ((v.x - mx) * Math.cos(ad * v.weight)) -
                                    ((v.y - my) * Math.sin(ad * v.weight));
            const sy = my + ((v.x - mx) * Math.sin(ad * v.weight)) +
                                    ((v.y - my) * Math.cos(ad * v.weight));

            moveSinglePoint(vuid, sx, sy);
        }

    }

    // Points scale,
    function scaleWeightedPoints(weighted_ctx, dx, dy, view_scale) {
        calcMidpoint(weighted_ctx);
        const { weighted_vs, mid } = weighted_ctx;
        let dst = -dy;
        if (Math.abs(dx) > Math.abs(dy)) {
            dst = dx;
        }

        const scale_factor = (dst / (250 * view_scale));

        const mx = mid.x;
        const my = mid.y;
        for (let vuid in weighted_vs) {
            const v = weighted_vs[vuid];
            const dx = v.x - mx;
            const dy = v.y - my;

            const sx = v.x + (dx * scale_factor * v.weight);
            const sy = v.y + (dy * scale_factor * v.weight);

            moveSinglePoint(vuid, sx, sy);
        }
    }

    return {
        translateWeightedPoints,
        rotateWeightedPoints,
        scaleWeightedPoints,
    };

}

module.exports = TransformPoints;
