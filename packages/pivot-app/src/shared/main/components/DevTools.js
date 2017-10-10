import React from 'react';

let DevTools0 = () => null;

if (__DEV__) {
  const createDevTools = require('redux-devtools').createDevTools;
  const DockMonitor = require('redux-devtools-dock-monitor').default;
  const Inspector = require('redux-devtools-inspector').default;

  DevTools0 = createDevTools(
    <DockMonitor defaultIsVisible={false} toggleVisibilityKey="ctrl-h" changePositionKey="ctrl-w">
      <Inspector />
    </DockMonitor>
  );
}

export const DevTools = DevTools0;
