import Dock from 'react-dock';
import { Overlay } from 'react-bootstrap';
import { Panel } from '../panel';
import { Scene } from '../../scene';
import { Toolbar } from '../../toolbar';
import { Session } from '../../session';
import { Settings } from '../../settings';

const viewStyle = { position: `absolute`, width: `100%`, height: `100%` };

function View({
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
} = {}) {
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
                  dockStyle={{
                      opacity: 1,
                      boxShadow: `none`,
                      overflow: `visible`,
                      background: `transparent`
                  }}
                  dockHiddenStyle={{
                      opacity: 1,
                      boxShadow: `none`,
                      overflow: `visible`,
                      background: `transparent`
                  }}>
                {/*<Session data={session}/>*/}
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
}

export { View };
export default View;
