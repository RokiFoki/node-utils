#!/usr/bin/env node

const globby = require('globby');
const fs = require('fs');
const archiver = require('archiver');
const Client = require('ssh2-sftp-client');
const sftp = new Client();

function config() {
    const lines = fs.readFileSync('.deployconfig').toString().split("\n");

    const config = {};
    lines.map(line => {
        return line.split('=').map(e => e.trim());
    }).forEach(keyvalue => {
        const [key, value] = keyvalue;
        config[key] = value;
    });

    return config;
}

function uploadFile(file) {
    return sftp.connect(config())
    .then(async () => {
        const list = await sftp.list('/uploads/');
        return Promise.all(list.map(e => sftp.delete(`/uploads/${e.name}`)));
    })
    .then(() => {
        return sftp.fastPut(file, '/uploads/' + file);
    }).finally(() => {
        sftp.end();
    });
}

function getCurDate() {
    const date = new Date();
    const year = date.getFullYear().toString();
    const month = date.getMonth().toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function getExcludedGlobs() {
    const array = fs.readFileSync('.deployignore').toString().split("\n");

    return array.filter(e => e.trim().length > 0 && !e.startsWith('#')).map(e => `!${e.trim()}`);
}

const zipFile = `application-${getCurDate()}.zip`;

const main = async () => {
    const output = fs.createWriteStream(zipFile);
    const archive = archiver('zip');

    output.on('close', function () {
        console.log(archive.pointer() + ' total bytes');
        console.log('archiver has been finalized and the output file descriptor has closed.');
    });

    archive.on('error', function(err){
        throw err;
    });

    archive.pipe(output);

    const files = await globby(['**/*',
    `!${zipFile}`].concat(getExcludedGlobs()));

    files.forEach(file => {
        archive.file(file, { name: file });
    });

    await archive.finalize();

    try {
        await uploadFile(zipFile);
    } catch(e) {
        console.error(e);
    }
    
    fs.unlinkSync(zipFile);
}

main().then(r => {
    console.log('finished');
})
