import Dock from 'react-dock';
import { container } from '@graphistry/falcor-react-redux';
import { Overlay } from 'react-bootstrap';
import { Scene } from 'viz-shared/containers/scene';
import { Panel } from 'viz-shared/containers/panel';
import { Toolbar } from 'viz-shared/containers/toolbar';
import { Labels } from 'viz-shared/containers/labels';
import { Selection } from 'viz-shared/containers/selection';

let View = ({
    scene, panels = {}, labels, toolbar, selection
} = {}) => {
    const { left = {}, right = {}, bottom = {} } = panels;
    const isLeftPanelOpen = !!panels.left;
    const isRightPanelOpen = !!panels.right;
    const isBottomPanelOpen = !!panels.bottom;
    return (
        <div style={{ position: `absolute`, width: `100%`, height: `100%` }}>
            <Scene data={scene}/>
            <Labels data={labels}/>
            <Selection data={selection}/>
            <Panel side='left'
                   data={left}
                   name={left.name}
                   placement='right'
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
            <Toolbar data={toolbar}/>
        </div>
    );
};

View = container(
    ({ scene, labels, toolbar, selection } = {}) => `{
        scene: ${ Scene.fragment(scene) },
        panels: {
            left: { id, name },
            right: { id, name },
            bottom: { id, name }
        },
        layout: { id, name },
        labels: ${ Labels.fragment(labels) },
        toolbar: ${ Toolbar.fragment(toolbar) },
        selection: ${ Selection.fragment(selection) }
    }`
)(View);

function popoverStyles(isOpen) {
    return {
        zIndex: 'initial',
        opacity: Number(isOpen),
        visibility: isOpen && 'visible' || 'hidden',
    };
}

export { View };
