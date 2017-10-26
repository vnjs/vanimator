"use strict";

// Handles Time Line for individual actions.

function ActionsTimeLineOpts(editor) {


    function getInitValues(action) {
        const action_uid = action.uid;

        const ss = editor.getSerializedState();
        const actions = ss.getArray('actions');
        const action_ob = actions.get(action_uid);
        const type = action_ob.get('type');

        const ret = {};

        if (type === '1d 0 1') {
            ret.left_limit =  [ 0, 0 ];
            ret.right_limit = [ 1, 1000 ];
        }
        else if (type === '1d -1 1') {
            ret.left_limit =  [ -1, 0 ];
            ret.right_limit = [  1, 1000 ];
        }
        else {
            throw Error("Unknown action type: " + type);
        }

        ret.current_time_point = action_ob.get('value');

        ret.event_info = {
            uid: action_ob.get('uid'),
            name: action_ob.get('name')
        };

        return ret;

    }



    // function getRangeOf(action) {
    //     const action_uid = action.uid;
    //
    //     const ss = editor.getSerializedState();
    //     const actions = ss.getArray('actions');
    //     const action_ob = actions.get(action_uid);
    //     const type = action_ob.get('type');
    //
    //     if (type === '1d 0 1') {
    //         return {
    //             left_limit:  [ 0, 0 ],
    //             right_limit: [ 1, 1000 ]
    //         };
    //     }
    //     else if (type === '1d -1 1') {
    //         return {
    //             left_limit:  [ -1, 0 ],
    //             right_limit: [  1, 1000 ]
    //         };
    //     }
    //     else {
    //         throw Error("Unknown action type: " + type);
    //     }
    //
    // }


    return {
        getInitValues,
    };

}

module.exports = ActionsTimeLineOpts;
