import Dock from 'react-dock';
import { container } from '@graphistry/falcor-react-redux';
import { Overlay } from 'react-bootstrap';
import { Scene } from 'viz-shared/containers/scene';
import { Panel } from 'viz-shared/containers/panel';
import { Toolbar } from 'viz-shared/containers/toolbar';
import { Settings } from 'viz-shared/containers/settings';
import { selectToolbarItem } from 'viz-shared/actions/toolbar';

import {
    sceneMouseMove,
    sceneTouchStart,
    onSelectedPointTouchStart,
    onSelectionMaskTouchStart,
} from 'viz-shared/actions/scene';

import {
    selectLabel,
} from 'viz-shared/actions/labels';

let View = ({
    selectLabel,
    sceneMouseMove,
    sceneTouchStart,
    selectToolbarItem,
    scene = {}, labels = {},
    panels = {}, toolbar = {},
    onSelectedPointTouchStart,
    onSelectionMaskTouchStart,
    selection = {}
} = {}) => {
    const { left = {}, right = {}, bottom = {} } = panels;
    const isLeftPanelOpen = !!panels.left;
    const isRightPanelOpen = !!panels.right;
    const isBottomPanelOpen = !!panels.bottom;
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
                <Panel side='right' data={right} key='right-panel'/>
            </Dock>
            <Dock fluid
                  key='bottom'
                  zIndex={3700}
                  dimMode='none'
                  position='bottom'
                  isVisible={isBottomPanelOpen}
                  defaultSize={1 - (1/Math.sqrt(2))}>
                <Panel side='bottom' data={bottom} key='bottom-panel'/>
            </Dock>
            <Toolbar key='toolbar' data={toolbar} selectToolbarItem={selectToolbarItem}/>
        </div>
    );
};

View = container({
    renderLoading: true,
    fragment: ({ scene, layout, toolbar } = {}) => `{
        scene: ${ Scene.fragment(scene) },
        panels: {
            left: { id, name },
            right: { id, name },
            bottom: { id, name }
        },
        layout: ${ Settings.fragment(layout) },
        toolbar: ${ Toolbar.fragment(toolbar) }
    }`,
    dispatchers: {
        selectLabel,
        sceneMouseMove,
        sceneTouchStart,
        selectToolbarItem,
        onSelectedPointTouchStart,
        onSelectionMaskTouchStart,
    }
})(View);

export { View };
