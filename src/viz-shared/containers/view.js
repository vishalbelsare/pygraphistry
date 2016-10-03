import Dock from 'react-dock';
import { container } from '@graphistry/falcor-react-redux';
import { Overlay } from 'react-bootstrap';
import { Scene } from 'viz-shared/containers/scene';
import { Panel } from 'viz-shared/containers/panel';
import { Toolbar } from 'viz-shared/containers/toolbar';
import { Labels } from 'viz-shared/containers/labels';
import { Settings } from 'viz-shared/containers/settings';
import { Selection } from 'viz-shared/containers/selection';
import {
    touchEnd, mouseMove,
    touchMove, touchStart,
    touchCancel
} from 'viz-shared/actions/view';

let View = ({
    touchCancel,
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
                   touchCancel={touchCancel}/>
            <Labels data={labels}/>
            <Selection data={selection}/>
            <div style={popoverStyles(isLeftPanelOpen)}>
                <Panel side='left' data={left}/>
            </div>
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
            <Toolbar data={toolbar}/>
        </div>
    );
};

View = container(
    ({ scene, labels, layout, toolbar, selection } = {}) => `{
        scene: ${ Scene.fragment(scene) },
        panels: {
            left: { id, name },
            right: { id, name },
            bottom: { id, name }
        },
        labels: ${ Labels.fragment(labels) },
        layout: ${ Settings.fragment(layout) },
        toolbar: ${ Toolbar.fragment(toolbar) },
        selection: ${ Selection.fragment(selection) }
    }`,
    (x) => x,
    {
        touchEnd, mouseMove,
        touchMove, touchStart,
        touchCancel
    }
)(View);

function popoverStyles(isOpen) {
    return {
        top: `0px`,
        left: `44px`,
        zIndex: `initial`,
        position: `absolute`,
        opacity: Number(isOpen),
        minWidth: isOpen ? undefined : `200px`,
        minHeight: isOpen ? undefined : `200px`,
        visibility: isOpen && 'visible' || 'hidden',
        transform: `translate3d(${Number(!isOpen) * -10}%, 6px, 0)`,
        transition: isOpen &&
            `opacity 0.2s, transform 0.2s, visibility 0s` ||
            `opacity 0.0s, transform 0.0s, visibility 0s linear 0.2s`
    };
}

export { View };
