import Dock from 'react-dock';
import { container } from 'reaxtor-redux';
import { Popover } from 'react-bootstrap';
import { Scene } from 'viz-shared/containers/scene';
import { Panel } from 'viz-shared/containers/panel';
import { Toolbar } from 'viz-shared/containers/toolbar';

export const View = container(
    ({ scene, toolbar } = {}) => `{
        scene: ${ Scene.fragment(scene) },
        panels: {
            left: { id, name },
            right: { id, name },
            bottom: { id, name }
        },
        toolbar: ${ Toolbar.fragment(toolbar) }
    }`
)(renderView);

function renderView({ scene, panels = {}, toolbar } = {}) {
    const { left = {}, right = {}, bottom = {} } = panels;
    const isLeftPanelOpen = !!panels.left;
    const isRightPanelOpen = !!panels.right;
    const isBottomPanelOpen = !!panels.bottom;
    return (
        <div style={{ position: `absolute`, width: `100%`, height: `100%` }}>
            <Scene data={scene}/>
            <Panel data={left}
                   key='left'
                   side='left'
                   placement='right'
                   id='left-panel'
                   title={left.name}
                   positionTop={5}
                   positionLeft={42}
                   style={popoverStyles(isLeftPanelOpen)}/>
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
            <Toolbar data={toolbar} left={left}
                     right={right} bottom={bottom}/>
        </div>
    );
}

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

