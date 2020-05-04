const fs = require("fs");
const path = require("path");

function readFilePromise(filePath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, (err, data) => {
            err ? resolve("") : resolve(data);
        });
    });
}
function writeFilePromise(filePath, contents) {
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, contents, (err, data) => {
            err ? reject(err) : resolve(data);
        });
    });
}
function copyFilePromise(source, dest) {
    return new Promise((resolve, reject) => {
        fs.copyFile(source, dest, (err) => {
            err ? reject(err) : resolve();
        });
    });
}

function mkdirPromise(path) {
    return new Promise((resolve, reject) => {
        fs.mkdir(path, { recursive: true }, (err) => {
            err ? reject(err) : resolve();
        });
    });
}

module.exports = async function() {
    let inputPath = this.resourcePath.replace(/\\/g, "/");

    let relativePath = this.resource.slice(this.rootContext.length).replace(/\\/g, "/");

    let buffer = await readFilePromise(inputPath);
    let bufferString = buffer.toString("base64");

    return `
        let g = new Function("return this")();
        g.rawFiles = g.rawFiles || Object.create(null);
        console.log("buffer.length", ${JSON.stringify(buffer.length)});
        console.log("bufferString.length", ${JSON.stringify(bufferString.length)});
        g.rawFiles[${JSON.stringify(relativePath)}] = Buffer.from(${JSON.stringify(bufferString)}, "base64");
    `;
};