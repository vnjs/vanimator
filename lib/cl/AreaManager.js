"use strict";

function AreaManager(getVectorX, getVectorY) {

    function findDistanceDiff(v, x, y, radius) {
        const dx = x - getVectorX(v);
        const dy = y - getVectorY(v);
        const distance_dif = ((dx * dx) + (dy * dy)) - (radius * radius);
        return distance_dif;
    }

    // Returns the closest vertex that is within the given radius of the
    // coordinates x, y.

    function nearestPointUidTo(point_set, x, y, radius) {
        const len = point_set.length;
        const within_radius = [];
        for (let i = len - 1; i >= 0; --i) {
            const v = point_set[i];
            const dd = findDistanceDiff(v, x, y, radius);
            if (dd < 0) {
                within_radius.push([i, dd]);
            }
        }
        if (within_radius.length > 0) {
            // Find the smallest one.
            const len = within_radius.length;
            let smallest = 1;
            let smallest_i;
            for (let i = 0; i < len; ++i) {
                const r = within_radius[i];
                const dd = r[1];
                if (dd < smallest) {
                    smallest_i = r[0];
                    smallest = dd;
                }
            }
            return point_set[smallest_i].uid;
        }
        else {
            return undefined;
        }
    }


    return {
        nearestPointUidTo
    };

}

module.exports = AreaManager;
