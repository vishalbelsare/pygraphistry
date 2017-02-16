import Dock from 'react-dock';
import { container } from '@graphistry/falcor-react-redux';
import { Overlay } from 'react-bootstrap';
import { Scene } from 'viz-shared/containers/scene';
import { Panel } from 'viz-shared/containers/panel';
import { Toolbar } from 'viz-shared/containers/toolbar';
import { Session } from 'viz-shared/containers/session';
import { Settings } from 'viz-shared/containers/settings';
import { selectToolbarItem } from 'viz-shared/actions/toolbar';

import {
    sceneMouseMove,
    sceneTouchStart,
    onSelectedPointTouchStart,
    onSelectionMaskTouchStart,
} from 'viz-shared/actions/scene';

import { selectLabel } from 'viz-shared/actions/labels';
import { selectInspectorRow } from 'viz-shared/actions/inspector';

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
        <div style={{ position: `absolute`, width: `100%`, height: `100%` }}>
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
                  dockStyle={{
                      boxShadow: `none`,
                      background: `transparent`
                  }}>
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
            <Session data={session}/>
        </div>
    );
};

View = container({
    renderLoading: true,
    fragment: ({ scene, layout, toolbar, session, panels = {} } = {}) => {
        return `{
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
        }`
    },
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
