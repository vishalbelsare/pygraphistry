import Dock from 'react-dock';
import { container } from 'reaxtor-redux';
import { Popover } from 'react-bootstrap';
import { Scene } from 'viz-shared/containers/scene';
import { Panel } from 'viz-shared/containers/panels';
import { Toolbar } from 'viz-shared/containers/toolbar';

function viewFragment({ scene, toolbar } = {}) {
    return `{
        scene: ${ Scene.fragment(scene) },
        panels: {
            left: { id, name },
            right: { id, name },
            bottom: { id, name }
        },
        toolbar: ${ Toolbar.fragment(toolbar) }
    }`;
}

function renderView({ scene, panels = {}, toolbar } = {}) {
    const { left = {}, right = {}, bottom = {} } = panels;
    const isLeftPanelOpen = !!panels.left;
    const isRightPanelOpen = !!panels.right;
    const isBottomPanelOpen = !!panels.bottom;
    return (
        <div style={{ position: `absolute`, width: `100%`, height: `100%` }}>
            <Scene data={scene}/>
            <Popover key={left.key}
                     placement='right'
                     id='left-panel'
                     title={left.name}
                     positionTop={5}
                     positionLeft={42}
                     style={popoverStyles(isLeftPanelOpen)}>
                <Panel side='left' key={left.key} data={left}/>
            </Popover>
            <Dock fluid
                  size={0.2}
                  dimMode='none'
                  position='right'
                  key={right.key}
                  isVisible={isRightPanelOpen}>
                <Panel side='right' key={right.key} data={right}/>
            </Dock>
            <Dock fluid
                  dimMode='none'
                  position='bottom'
                  key={bottom.key}
                  isVisible={isBottomPanelOpen}
                  size={1 - (1/Math.sqrt(2))}>
                <Panel side='bottom' key={bottom.key} data={bottom}/>
            </Dock>
            <Toolbar key={toolbar.key} data={toolbar}
                     {...{left, right, bottom}}/>
        </div>
    );
}

export const View = container(
    viewFragment
)(renderView);

function popoverStyles(isOpen) {
    return {
        zIndex: 'initial',
        minWidth: `300px`,
        opacity: Number(isOpen),
        visibility: isOpen && 'visible' || 'hidden',
        reansform: `translate3d(${Number(!isOpen) * -10}%, 0, 0)`,
        transition: isOpen &&
            `opacity 0.2s, transform 0.2s, visibility 0s` ||
            `opacity 0.2s, transform 0.2s, visibility 0s linear 0.2s`
    };
}

