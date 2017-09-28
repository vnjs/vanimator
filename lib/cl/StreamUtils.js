"use strict";


function streamToString(stream, callback) {
    stream.setEncoding('utf8');
    let output = '';
    stream.on("data", (chunk) => {
        if (typeof chunk !== 'string') {
            return callback(Error('Expecting String type'));
        }
        output += chunk;
    });
    stream.on("end", () => {
        callback(undefined, output);
    });
    stream.on("error", (err) => {
        callback(err);
    });
}

function processStreamOutputString(errorHandler, stringHandler) {
    return (err, stream) => {
        streamToString(stream, (err, string) => {
            if (err) {
                return errorHandler(err);
            }
            else {
                return stringHandler(string);
            }
        });
    };
}


module.exports = {
    streamToString,
    processStreamOutputString
};
