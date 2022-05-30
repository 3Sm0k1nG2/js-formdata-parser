const mimeTypes = [
    { mime: 'image/jpeg', ext:'.jpg'},
    { mime: 'image/png', ext:'.png'},
    { mime: 'image/webp', ext:'.webp'},
    { mime: 'image/x-icon', ext:'.ico'},
    { mime: 'text/css', ext:'.css'}
]

module.exports.getMimeType = (fileExt) => {
    return mimeTypes.find(x => x.ext === fileExt).mime;
}

module.exports.getFileExt = (mimeType) => {
    return mimeTypes.find(x => x.mime === mimeType).ext;

}