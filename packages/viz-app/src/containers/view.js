import SplitPane from 'react-split-pane';
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
const containerStyleFull = { ...viewStyle, position: `relative`, overflow: 'hidden' };
const containerStyleWithToolbar = { ...viewStyle, ...containerStyleFull, top: 41, height: `calc(100% - 41px)` };
const containerVisibleStyle = { ...containerStyleFull, overflow: 'visible', flex: '1 1 auto' };
const rightDockHiddenStyle = { opacity: 1, boxShadow: `none`, overflow: `visible`, background: `transparent` };
const rightDockVisibleStyle = { opacity: 1, boxShadow: `none`, overflow: `visible`, background: `transparent` };

let View = ({
    session,
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
    const containerStyle = (window && window.innerWidth < 330) ? containerStyleFull : containerStyleWithToolbar;
    return (
        // <SplitPane allowResize={false} split='horizontal' size='0px'>
        <div style={viewStyle}>
            <div style={containerStyle}>
                <SplitPane allowResize={isBottomPanelOpen}
                           split='horizontal' primary='second'
                           minSize={0} paneStyle={containerStyleFull}
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
            </div>
            <Toolbar key='toolbar' data={toolbar} selectToolbarItem={selectToolbarItem}>
                <Panel key='left-panel' side='left' data={left} isOpen={isLeftPanelOpen}/>
            </Toolbar>
        </div>
        // </SplitPane>
    );
};

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
