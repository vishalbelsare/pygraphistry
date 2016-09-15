import React from 'react'
import { createDevTools } from 'redux-devtools';
import LogMonitor from 'redux-devtools-log-monitor';
import DockMonitor from 'redux-devtools-dock-monitor';
import Inspector from 'redux-devtools-inspector';

export const DevTools = createDevTools(
    <DockMonitor defaultIsVisible={false}
                 toggleVisibilityKey="ctrl-h"
                 changePositionKey="ctrl-w">
        <Inspector select={(state) => {
            do {
                const { workbooks } = state;
                if (!workbooks) { state = state; break; }
                const { open: workbook } = workbooks;
                if (!workbook) { state = workbooks; break; }
                const { views } = workbook;
                if (!views) { state = workbook; break; }
                const { current: view } = views;
                if (!view) { state = views; break; }
                state = view; break;
            } while (true);
            return state;
        }}/>
    </DockMonitor>
);
