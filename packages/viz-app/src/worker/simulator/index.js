'use strict';

import path from 'path';
import VizServer from './server-viz';

VizServer.staticFilePath = function staticFilePath() {
    return path.resolve(__dirname, '..');
};

export default VizServer;
