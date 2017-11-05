"use strict";

function ncmp(v1, v2) {
    if (v1 < v2) {
        return -1;
    }
    else if (v1 > v2) {
        return 1;
    }
    return 0;
}

function doUidsMatch(uid_set1, uid_set2) {

    if (uid_set1.length !== uid_set2.length) {
        return false;
    }

    uid_set1.sort(ncmp);
    const cin = [].concat(uid_set2);
    cin.sort(ncmp);
    for (let i = 0; i < cin.length; ++i) {
        if (cin[i] !== uid_set1[i]) {
            return false;
        }
    }
    return true;

}

module.exports = {
    doUidsMatch
};
