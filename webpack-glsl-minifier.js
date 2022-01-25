function minify(glslSource)
{
    const multilineComments = /\/\*(.|\s)*?\*\//g;
    const lineComments = /\/\/.*$/gm;

    const minifiedSource = glslSource
                           .replace(multilineComments, '')
                           .replace(lineComments, '')
                           .split('\n')
                           .map(line => line.trim())
                           .filter(line => line)
                           .join('\n');

    return 'module.exports = ' + JSON.stringify(minifiedSource);
}

module.exports = minify;
