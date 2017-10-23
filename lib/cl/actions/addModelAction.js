"use strict";

const uuidv1 = require('uuid/v1');

module.exports = function addModelAction(editor, action_name) {

    const ss = editor.getSerializedState();

    const actions = ss.getArray('actions');

    const uid = uuidv1();

    const model_action_ob = {
        uid: uid,
        name: action_name,
        type: '1d 0 1'
    };

    actions.push(uid, model_action_ob);

    // Checkpoint for UNDO
    editor.checkpointHistory();

    editor.refreshTreePanels();

};
