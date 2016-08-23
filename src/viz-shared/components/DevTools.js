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

//     <LogMonitor select={(state) => {
//         const { workbooks } = state;
//         if (!workbooks) { return state; }
//         const { open: workbook } = workbooks;
//         if (!workbook) { return workbooks; }
//         const { views } = workbook;
//         if (!views) { return workbook; }
//         const { current: view } = views;
//         if (!view) { return views; }
//         return view;
//     }} />
