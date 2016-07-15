import React from 'react'
import { createDevTools } from 'redux-devtools';
import LogMonitor from 'redux-devtools-log-monitor';
import DockMonitor from 'redux-devtools-dock-monitor';
import Inspector from 'redux-devtools-inspector';

export const DevTools = createDevTools(
    <DockMonitor defaultIsVisible={false}
                 toggleVisibilityKey="ctrl-h"
                 changePositionKey="ctrl-w">
        <Inspector/>
    </DockMonitor>
);
