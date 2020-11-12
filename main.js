'use strict';

const {Writable} = require('stream');

const waitForWrite = (chunk, encoding) => (output, index, array) =>
  output
    ? new Promise(resolve => {
        let error = null;
        try {
          output.write(chunk, encoding, e => {
            e = e || error;
            if (e) array[index] = null;
            resolve(e);
          });
        } catch (e) {
          error = e;
        }
      })
    : Promise.resolved(null);

const waitForEnd = (output, index, array) =>
  output
    ? new Promise(resolve => {
        let error = null;
        try {
          output.end(e => {
            e = e || error;
            if (e) array[index] = null;
            resolve(e);
          });
        } catch (e) {
          error = e;
        }
      })
    : Promise.resolved(null);

function reportErrors(callback) {
  return results => {
    const ok = results.every(error => {
      if (error) {
        callback(error);
        return false;
      }
      return true;
    });
    if (ok) {
      callback(null);
    } else {
      this.outputs = this.outputs.filter(output => output);
    }
  };
}

function ignoreErrors(callback) {
  return () => {
    if (this.outputs.some(output => !output)) {
      this.outputs = this.outputs.filter(output => output);
    }
    callback(null);
  };
}

class Fork extends Writable {
  constructor(outputs, options = {objectMode: true}) {
    super(options);
    this.outputs = outputs;
    this.processResults = options && options.ignoreErrors ? ignoreErrors : reportErrors;

    // add error handlers to avoid the default ones
    this.outputs.forEach(stream => stream.on('error', () => {}));

    // connect events
    if (!options || !options.ignoreErrors) {
      this.outputs.forEach(stream => stream.on('error', error => {
        this.outputs = this.outputs.filter(s => s !== stream);
        if (this.startedWriting) return;
        this.emit('error', error);
      }));
    }
  }
  _write(chunk, encoding, callback) {
    this.startedWriting = true;
    Promise.all(this.outputs.map(waitForWrite(chunk, encoding))).then(this.processResults(callback));
  }
  _final(callback) {
    this.startedWriting = true;
    Promise.all(this.outputs.map(waitForEnd)).then(this.processResults(callback));
  }
  isEmpty() {
    return !this.outputs.length;
  }
  static fork(outputs, options = {objectMode: true}) {
    return new Fork(outputs, options);
  }
}

module.exports = Fork;
