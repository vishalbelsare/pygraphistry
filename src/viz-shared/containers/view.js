import Dock from 'react-dock';
import { container } from '@graphistry/falcor-react-redux';
import { Overlay } from 'react-bootstrap';
import { Scene } from 'viz-shared/containers/scene';
import { Panel } from 'viz-shared/containers/panel';
import { Toolbar } from 'viz-shared/containers/toolbar';
import { Settings } from 'viz-shared/containers/settings';
import { selectToolbarItem } from 'viz-shared/actions/toolbar';

import {
    touchEnd, mouseMove,
    touchMove, touchStart,
    touchCancel, onPointSelected
} from 'viz-shared/actions/view';

let View = ({
    touchCancel,
    onPointSelected,
    selectToolbarItem,
    touchEnd, mouseMove,
    touchMove, touchStart,
    scene = {}, labels = {},
    panels = {}, toolbar = {},
    selection = {}
} = {}) => {
    const { left = {}, right = {}, bottom = {} } = panels;
    const isLeftPanelOpen = !!panels.left;
    const isRightPanelOpen = !!panels.right;
    const isBottomPanelOpen = !!panels.bottom;
    return (
        <div style={{ position: `absolute`, width: `100%`, height: `100%` }}>
            <Scene data={scene}
                   touchEnd={touchEnd}
                   mouseMove={mouseMove}
                   touchMove={touchMove}
                   touchStart={touchStart}
                   touchCancel={touchCancel}
                   onPointSelected={onPointSelected}
                   selectToolbarItem={selectToolbarItem}/>
            <Panel side='left' data={left} isOpen={isLeftPanelOpen}/>
            <Dock fluid
                  size={0.2}
                  dimMode='none'
                  key='right'
                  position='right'
                  isVisible={isRightPanelOpen}>
                <Panel side='right' data={right}/>
            </Dock>
            <Dock fluid
                  dimMode='none'
                  key='bottom'
                  position='bottom'
                  isVisible={isBottomPanelOpen}
                  size={1 - (1/Math.sqrt(2))}>
                <Panel side='bottom' data={bottom}/>
            </Dock>
            <Toolbar data={toolbar} selectToolbarItem={selectToolbarItem}/>
        </div>
    );
};

View = container(
    ({ scene, layout, toolbar } = {}) => `{
        scene: ${ Scene.fragment(scene) },
        panels: {
            left: { id, name },
            right: { id, name },
            bottom: { id, name }
        },
        layout: ${ Settings.fragment(layout) },
        toolbar: ${ Toolbar.fragment(toolbar) }
    }`,
    (x) => x,
    {
        onPointSelected,
        touchEnd, mouseMove,
        touchMove, touchStart,
        touchCancel, selectToolbarItem
    }
)(View);

export { View };
