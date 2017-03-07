import Dock from 'react-dock';
import { Scene } from 'viz-app/containers/scene';
import { Panel } from 'viz-app/containers/panel';
import { Toolbar } from 'viz-app/containers/toolbar';
import { Session } from 'viz-app/containers/session';
import { Settings } from 'viz-app/containers/settings';
import { container } from '@graphistry/falcor-react-redux';
import { selectToolbarItem } from 'viz-app/actions/toolbar';

import {
    sceneMouseMove,
    sceneTouchStart,
    onSelectedPointTouchStart,
    onSelectionMaskTouchStart,
} from 'viz-app/actions/scene';

import { selectLabel } from 'viz-app/actions/labels';
import { selectInspectorRow } from 'viz-app/actions/inspector';

const viewStyle = { position: `absolute`, width: `100%`, height: `100%` };
const rightDockHiddenStyle = { opacity: 1, boxShadow: `none`, overflow: `visible`, background: `transparent` };
const rightDockVisibleStyle = { opacity: 1, boxShadow: `none`, overflow: `visible`, background: `transparent` };

let View = ({
    session,
    selectLabel,
    sceneMouseMove,
    sceneTouchStart,
    selectToolbarItem,
    selectInspectorRow,
    scene = [], labels = [],
    panels = [], toolbar = [],
    onSelectedPointTouchStart,
    onSelectionMaskTouchStart
} = {}) => {
    const { left = [], right = [], bottom = [] } = panels;
    const isLeftPanelOpen = left && left.id !== undefined;
    const isRightPanelOpen = right && right.id !== undefined;
    const isBottomPanelOpen = bottom && bottom.id !== undefined;
    return (
        <div style={viewStyle}>
            <Scene key='scene'
                   data={scene}
                   selectLabel={selectLabel}
                   sceneMouseMove={sceneMouseMove}
                   sceneTouchStart={sceneTouchStart}
                   selectToolbarItem={selectToolbarItem}
                   onSelectedPointTouchStart={onSelectedPointTouchStart}
                   onSelectionMaskTouchStart={onSelectionMaskTouchStart}/>
            <Panel key='left-panel' side='left' data={left} isOpen={isLeftPanelOpen}/>
            <Dock fluid
                  key='right'
                  dimMode='none'
                  zIndex={3700}
                  position='right'
                  defaultSize={0.2}
                  isVisible={isRightPanelOpen}
                  dockStyle={rightDockVisibleStyle}
                  dockHiddenStyle={rightDockHiddenStyle}>
                <Session data={session}/>
                <Panel side='right'
                       data={right}
                       key='right-panel'
                       isOpen={isRightPanelOpen}/>
            </Dock>
            <Dock fluid
                  key='bottom'
                  zIndex={3700}
                  dimMode='none'
                  position='bottom'
                  isVisible={isBottomPanelOpen}
                  defaultSize={1 - (1/Math.sqrt(2))}>
            {({ position, isResizing, size, isVisible }) => (
                <Panel side='bottom'
                       data={bottom}
                       key='bottom-panel'
                       colWidth={150}
                       rowHeight={30}
                       colHeaderWidth={48}
                       rowHeaderHeight={32}
                       width={window.innerWidth}
                       selectInspectorRow={selectInspectorRow}
                       height={size * window.innerHeight - 60}
                       isOpen={isVisible && isBottomPanelOpen}
                       style={{ width: window.innerWidth,
                                height: size * window.innerHeight }}/>
            )}
            </Dock>
            <Toolbar key='toolbar' data={toolbar} selectToolbarItem={selectToolbarItem}/>
        </div>
    );
};

View = container({
    renderLoading: true,
    fragment: ({ scene, layout, toolbar, session, panels = {} } = {}) => `{
        pruneOrphans,
        scene: ${ Scene.fragment(scene) },
        layout: ${ Settings.fragment(layout) },
        toolbar: ${ Toolbar.fragment(toolbar) },
        session: ${ Session.fragment(session) },
        panels: {
            left: ${ Panel.fragment(panels.left, { side: 'left' }) },
            right: ${ Panel.fragment(panels.right, { side: 'right' }) },
            bottom: ${ Panel.fragment(panels.bottom, { side: 'bottom' }) }
        }
    }`,
    dispatchers: {
        selectLabel,
        sceneMouseMove,
        sceneTouchStart,
        selectToolbarItem,
        selectInspectorRow,
        onSelectedPointTouchStart,
        onSelectionMaskTouchStart,
    }
})(View);

export { View };
