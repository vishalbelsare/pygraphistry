import React, { PropTypes } from 'react';
import SplitPane from 'react-split-pane';
import getContext from 'recompose/getContext';
import { AutoSizer } from 'react-virtualized';
import { Scene } from 'viz-app/containers/scene';
import { Panel } from 'viz-app/containers/panel';
import { Toolbar } from 'viz-app/containers/toolbar';
import { Session } from 'viz-app/containers/session';
import { Settings } from 'viz-app/containers/settings';
import { container } from '@graphistry/falcor-react-redux';
import { Expressions } from 'viz-app/containers/expressions';
import { selectToolbarItem } from 'viz-app/actions/toolbar';

import {
    sceneShiftDown,
    sceneMouseMove,
    sceneTouchStart,
    onSelectedPointTouchStart,
    onSelectionMaskTouchStart,
} from 'viz-app/actions/scene';

import { selectLabel } from 'viz-app/actions/labels';
import { selectInspectorRow } from 'viz-app/actions/inspector';

const viewStyle = { position: `absolute`, width: `100%`, height: `100%` };
const containerStyle = { ...viewStyle, position: `relative`, overflow: 'hidden' };
const containerVisibleStyle = { ...containerStyle, overflow: 'visible', flex: '1 1 auto' };
const rightDockHiddenStyle = { opacity: 1, boxShadow: `none`, overflow: `visible`, background: `transparent` };
const rightDockVisibleStyle = { opacity: 1, boxShadow: `none`, overflow: `visible`, background: `transparent` };

let View = ({
    session,
    info = true,
    menu = true,
    selectLabel,
    sceneShiftDown,
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
    const toolbarHeight = !menu || !toolbar || !toolbar.visible || (
                           window && window.innerWidth < 330) ? 0 : 41;
    return (
        <SplitPane split='horizontal' allowResize={false}
                   style={viewStyle} size={`${toolbarHeight}px`}>
            <Toolbar key='toolbar' menu={menu} data={toolbar} selectToolbarItem={selectToolbarItem}>
                <Panel key='left-panel' side='left' data={left} isOpen={isLeftPanelOpen}/>
            </Toolbar>
            <SplitPane allowResize={isBottomPanelOpen}
                       split='horizontal' primary='second'
                       minSize={0} paneStyle={containerStyle}
                       defaultSize={isBottomPanelOpen ? `${(1 - (1/Math.sqrt(2)))*100}%` : '0%'}>
                <SplitPane allowResize={isRightPanelOpen}
                           split='vertical' primary='second'
                           minSize={0} paneStyle={containerVisibleStyle}
                           defaultSize={isRightPanelOpen ? `20%` : '0%'}>
                    <div style={containerVisibleStyle}>
                        <AutoSizer>
                        {({ width, height }) => (
                        <Scene key='scene'
                               data={scene}
                               simulationWidth={width}
                               simulationHeight={height}
                               selectLabel={selectLabel}
                               toolbarHeight={toolbarHeight-1}
                               sceneShiftDown={sceneShiftDown}
                               sceneMouseMove={sceneMouseMove}
                               sceneTouchStart={sceneTouchStart}
                               selectToolbarItem={selectToolbarItem}
                               style={{ ...viewStyle, width, height }}
                               onSelectedPointTouchStart={onSelectedPointTouchStart}
                               onSelectionMaskTouchStart={onSelectionMaskTouchStart}/>
                        )}
                        </AutoSizer>
                    </div>
                    <div style={containerVisibleStyle}>
                        <Session data={session}/>
                        <Panel side='right' data={right} key='right-panel' isOpen={isRightPanelOpen}/>
                    </div>
                </SplitPane>
                <div style={{ ...containerVisibleStyle, flex: '1 1 auto' }}>
                    <AutoSizer>
                    {({ width, height = 0 }) => (
                        <Panel side='bottom'
                               data={bottom}
                               key='bottom-panel'
                               colWidth={150}
                               rowHeight={30}
                               colHeaderWidth={48}
                               rowHeaderHeight={32}
                               height={Math.max(height - 60, 0) || 0}
                               width={width} isOpen={isBottomPanelOpen}
                               style={{ width, height: height || 0 }}
                               selectInspectorRow={selectInspectorRow}/>
                    )}
                    </AutoSizer>
                </div>
            </SplitPane>
        </SplitPane>
    );
};

View = getContext({
    info: PropTypes.bool,
    menu: PropTypes.bool,
})(View);

View = container({
    renderLoading: true,
    fragment: ({ scene, layout, toolbar, session, filters, exclusions, panels = {} } = {}) => `{
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
        sceneShiftDown,
        sceneMouseMove,
        sceneTouchStart,
        selectToolbarItem,
        selectInspectorRow,
        onSelectedPointTouchStart,
        onSelectionMaskTouchStart,
    }
})(View);

export { View };
