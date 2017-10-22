"use strict";

module.exports = function addModelAction(editor, action_name) {

    const ss = editor.getSerializedState();

    const actions = ss.getArray('actions');





    // Checkpoint for UNDO
    editor.checkpointHistory();

    editor.refreshTreePanels();

};
