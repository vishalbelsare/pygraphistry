import Dock from 'react-dock';
import { container } from '@graphistry/falcor-react-redux';
import { Overlay } from 'react-bootstrap';
import { Scene } from 'viz-shared/containers/scene';
import { Panel } from 'viz-shared/containers/panel';
import { Toolbar } from 'viz-shared/containers/toolbar';
import { Settings } from 'viz-shared/containers/settings';
import { selectToolbarItem } from 'viz-shared/actions/toolbar';

import { Labels } from 'viz-client/components/labels'

import {
    sceneMouseMove,
    sceneTouchStart,
    onSelectedPointTouchStart,
    onSelectionMaskTouchStart,
} from 'viz-shared/actions/scene';

let View = ({
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
            <Scene data={scene}
                   mouseMove={sceneMouseMove}
                   touchStart={sceneTouchStart}
                   selectToolbarItem={selectToolbarItem}
                   onSelectedPointTouchStart={onSelectedPointTouchStart}
                   onSelectionMaskTouchStart={onSelectionMaskTouchStart}/>
            <Panel side='left' data={left} isOpen={isLeftPanelOpen}/>
            <Dock fluid
                  key='right'
                  dimMode='none'
                  zIndex={3700}
                  position='right'
                  defaultSize={0.2}
                  isVisible={isRightPanelOpen}
                  dockStyle={{
                      background: `transparent`,
                      'box-shadow': `none`
                  }}>
                <Panel side='right' data={right}/>
            </Dock>
            <Dock fluid
                  key='bottom'
                  zIndex={3700}
                  dimMode='none'
                  position='bottom'
                  isVisible={isBottomPanelOpen}
                  size={1 - (1/Math.sqrt(2))}>
                <Panel side='bottom' data={bottom}/>
            </Dock>
            <Toolbar data={toolbar} selectToolbarItem={selectToolbarItem}/>
        </div>
    );
};

View = container({
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
        sceneMouseMove,
        sceneTouchStart,
        selectToolbarItem,
        onSelectedPointTouchStart,
        onSelectionMaskTouchStart,
    }
})(View);

export { View };
