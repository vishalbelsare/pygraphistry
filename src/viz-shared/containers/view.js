import Dock from 'react-dock';
import { connect } from 'reaxtor-redux';
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
    const { left, right, bottom } = panels;
    const isLeftPanelOpen = !!left;
    const isRightPanelOpen = !!right;
    const isBottomPanelOpen = !!bottom;
    return (
        <div style={{ position: `absolute`, width: `100%`, height: `100%` }}>
            <Scene falcor={scene}/>
            <Popover key='left-panel'
                     placement='right'
                     id='left-panel'
                     title={left && left.name}
                     rootClose={true}
                     positionTop={5}
                     positionLeft={42}
                     style={popoverStyles(isLeftPanelOpen)}>
                <Panel side='left' falcor={left || {}}/>
            </Popover>
            <Dock dimMode='none'
                  position='right'
                  key='right-panel'
                  defaultSize={0.2}
                  isVisible={isRightPanelOpen}>
                <Panel side='right' falcor={right || {}}/>
            </Dock>
            <Dock dimMode='none'
                  position='bottom'
                  key='bottom-panel'
                  isVisible={isBottomPanelOpen}
                  defaultSize={1 - (1/Math.sqrt(2))}>
                <Panel side='bottom' falcor={bottom || {}}/>
            </Dock>
            <Toolbar falcor={toolbar} {...{left, right, bottom}}/>
        </div>
    );
}

export const View = connect(
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

