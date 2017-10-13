// Modified from FB's create-react-app

const opn = require('opn');
const path = require('path');
const { execSync } = require('child_process');

module.exports.default = port => {
    const uri = `http://localhost:${port}/graph/graph.html?dataset=Miserables`;
    if (process.platform === 'darwin') {
        try {
            // Try our best to reuse existing tab
            // on OS X Google Chrome with AppleScript
            execSync('ps cax | grep "Google Chrome"');
            execSync(`osascript ${path.join(__dirname, './openChrome.applescript')} ${uri}`);
            return true;
        } catch (err) {
            // Ignore errors.
        }
    }
    // Fallback to opn
    try {
        opn(uri);
        return true;
    } catch (err) {
        return false;
    }
};
