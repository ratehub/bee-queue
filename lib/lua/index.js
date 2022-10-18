'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const promisify = require('promise-callbacks').promisify;

const scripts = {};
const shas = {};
let scriptsRead = false;
let scriptsPromise = null;

const readFile = promisify.methods(fs, ['readFile']).readFile;
const readDir = promisify.methods(fs, ['readdir']).readdir;

function readScript(file) {
  return readFile(path.join(__dirname, file), 'utf8').then((script) => {
    const name = file.slice(0, -4);
    scripts[name] = script;
    const hash = crypto.createHash('sha1');
    hash.update(script);
    shas[name] = hash.digest('hex');
  });
}

function readScripts() {
  if (scriptsRead) return scriptsPromise;
  scriptsRead = true;
  return (scriptsPromise = readDir(__dirname)
    .then((files) =>
      Promise.all(files.filter((file) => file.endsWith('.lua')).map(readScript))
    )
    .then(() => scripts));
}

module.exports = {
  scripts,
  shas,
  readScripts,
};
