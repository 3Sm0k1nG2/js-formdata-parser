const fs = require('fs/promises');
const { randomUUID } = require('crypto');
const { getFileExt } = require('./mimeTypes');

const contentTypeAsBuffer = Buffer.from('Content-Type', 'binary');
const tempPath = './TEMP/';

const LF = 10;
const CR = 13;

const fields = [];
const files = [];

let data = {};
let splitter;

let lastFilePath;
let incomingDataBufferSize;
let writingFile = false;
let fileToReadOnBottom = true;

module.exports.processFormData = (incomingDataBuffer, filesSaveDir) => {
    incomingDataBufferSize = incomingDataBuffer.length;

    if(!splitter){
        let foundIndex = incomingDataBuffer.findIndex(module.exports.isEndLine);1
        splitter = incomingDataBuffer.slice(0, foundIndex);
    }

    let boundaries = getBoundaries(incomingDataBuffer, splitter);

    if(boundaries.length === 0){
        fileToReadOnBottom = !fileToReadOnBottom;
        writingFile = true;
        fs.appendFile(lastFilePath, incomingDataBuffer)
        return;
    } 

    if(writingFile){
        writingFile = false;

        let range = this.findBufferRangeInBuffer(incomingDataBuffer, Buffer.from('\r\n'));
        let fileBuffer = incomingDataBuffer.slice(0, range.start);

        fs.appendFile(lastFilePath, fileBuffer);

        incomingDataBuffer = incomingDataBuffer.slice(range.end);
        let prevSize = incomingDataBufferSize - incomingDataBuffer.length ;

         boundaries.forEach(x => {
            x.start -= prevSize;
            x.end -= prevSize; 
        })
    }

    let dataBuffer = getData(incomingDataBuffer, boundaries);
    disjuncFilesAndFields(dataBuffer);

    processFiles(filesSaveDir)
    processFields();
}


module.exports.isEndLine = (byte, index, data) => {
    return byte === CR && data[index + 1] === LF
}

module.exports.clearData = () => {
    splitter = null;
    data = {};
    fileToReadOnBottom = true;
}

module.exports.getData = () => {
    return data;
}

module.exports.clearTemp = (filePath) => {
    if(filePath){
        fs.rm(filePath);
        return;
    }


    fs.readdir(tempPath)
        .then(files => {
            if(files.length === 0)
                return;

            for(let filename of files)
                fs.rm(tempPath + filename);
        })
}

function getBoundaries (buffer = Buffer.alloc(0), splitter = Buffer.alloc(0)) {
    return module.exports.findBufferRangeInBuffer(buffer, splitter, true);
}

function getData (buffer = Buffer.alloc(0), boundaries = []) {
    let arrData = []
    let s;
    let end;

    while(boundaries.length > 0){
        let e = boundaries.shift().end;

        if(boundaries.length > 0)
            s = boundaries[0].start;

        arrData.push(buffer.slice(e+3, s-1));
        end = s;
    }

    let del = arrData.pop() || Buffer.alloc(1);

    // May cause an inteference when having single-buffer processing - FIXED, maybe
    if(fileToReadOnBottom){
        let length = (arrData.length + 1) * (splitter.length + 4) + del.length;
        arrData.forEach(x => length += x.length);
    
        if(length < incomingDataBufferSize){
            // 2 = '\r\n', splitter.length = '------WebKitFormBoundary...'
            arrData.push(buffer.slice(end+1 + splitter.length + 2));
        }
    }

    return arrData;
}

 function disjuncFilesAndFields (bufferArr = new Uint8Array()) {
    for(let buffer of bufferArr){
        if(module.exports.findBufferInBuffer(buffer, contentTypeAsBuffer))
            files.push(buffer);
        else
            fields.push(buffer);
    }
}

 function processFiles (saveDir = tempPath) {
    while(files.length > 0){
        let buffer = files.shift();

        let range = module.exports.findBufferRangeInBuffer(buffer, Buffer.from('\r\n'));

        let fieldBuffer = buffer.slice(0, range.end-1);
        let fileBuffer = buffer.slice(range.end+1);

        range = module.exports.findBufferRangeInBuffer(fileBuffer, Buffer.from('\r\n\r\n'));

        let fileInfo = fileBuffer.slice(0, range.end-3);
        fileBuffer = fileBuffer.slice(range.end+1);

        range = module.exports.findBufferRangeInBuffer(fileInfo, Buffer.from('Content-Type: '));

        if((Array.isArray(range) && range.length === 0) || !range)
            throw new Error('Expected range to return');
 
        let mimeType = fileInfo.slice(range.end+1).toString();
        if(mimeType === 'application/octet-stream'){
            return;
        }

        let ext = getFileExt(mimeType);

        if(!ext){
            throw new Error('Add extension file for mime type:' + mimeType);
        }

        let fileName = randomUUID() + ext;
        let filePath = saveDir + fileName;
        lastFilePath = filePath;

        let fieldBufferNewData = Buffer.from(`; filepath="${filePath}"; new-filename="${fileName}"; ext="${ext}"; `);

        fs.writeFile(filePath, fileBuffer)

        fieldBuffer = Buffer.concat([fieldBuffer, fieldBufferNewData])
        fields.push(fieldBuffer);
    }
}

function processFields() {
    while(fields.length > 0){
        let buffer = fields.shift();

        if(buffer.length === 0)
            continue;

        let range = module.exports.findBufferRangeInBuffer(buffer, Buffer.from('Content-Disposition: form-data; '));

        buffer = buffer.slice(range.end + 1);

        range = module.exports.findBufferRangeInBuffer(buffer, Buffer.from('\r\n\r\n'));
        
        let keyBuffer = buffer.slice(0, range.start+1);
        let content = buffer.slice(range.end+1);

        if(range.length === 0)
            keyBuffer = content;

        let ranges = module.exports.findBufferRangeInBuffer(keyBuffer, Buffer.from('; '), true);

        if(ranges.length === 0){
            range = module.exports.findBufferRangeInBuffer(keyBuffer, Buffer.from('='));

            let value = keyBuffer.slice(range.end+2, keyBuffer.length-1);
            data[value] = content.toString();

            continue;
        }

        let pairs = {};
        let start = 0;

        while(ranges.length > 0){
            let range = ranges.shift();

            let pair = keyBuffer.slice(start, range.start+1);
            start = range.end+1;

            range = module.exports.findBufferRangeInBuffer(pair, Buffer.from('='));

            let key = pair.slice(0, range.start+1);
            let value = pair.slice(range.end+2, pair.length-1);

            pairs[key] = value.toString();
        }

        data[pairs.name] = {};

        for(let key in pairs){
            if(key === 'name')
                continue;

            data[pairs.name][key] = pairs[key]; 
        }
    }
}

module.exports.findBufferInBuffer = (buffer = Buffer.alloc(0), bufferToFind = buffer.alloc(0)) => {
    let i = 0; 
    let j = 0;

    let bufferSize = buffer.length;
    let bufferToFindSize = bufferToFind.length;

    while(i < bufferSize){
        if(buffer[i] === bufferToFind[j])
            j++;
        else
            j = 0;
        
        if(j === bufferToFindSize){
            return true;
        }

        i++;
    }

    return false;
}

module.exports.findBufferRangeInBuffer = (buffer = Buffer.alloc(0), bufferToFind = Buffer.alloc(0), multipleOccurrences = false) => {
    let i = 0; 
    let j = 0;

    let start = 0;

    let bufferSize =  buffer.length;
    let bufferToFindSize = bufferToFind.length;

    let arr = [];

    while(i < bufferSize){
        if(buffer[i] === bufferToFind[j])
            j++;
        else{
            start = i;
            j = 0;
        }
        
        if(j !== bufferToFindSize){
            i++;
            continue;
        }
        
        if(!multipleOccurrences)
            return  {start, end: i};

        arr.push({start, end: i});
    }

    return arr;
}