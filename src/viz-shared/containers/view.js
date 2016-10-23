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
            <Labels
                opacity={0.9}
                background="red"
                foreground="blue"

                poiEnabled={true} //our labels
                enabled={true} //even if not ours, may want a stub for theirs

                //ideally, icon states would also reflect whether there already is a filter/exclude/encode
                onClick={ (id, type, obj) => console.log('label click', {id, type, obj}) }
                onFilter={ (id, type, obj) => console.log('request to create filter', {id, type, obj})}
                onExclude={ (id, type, obj) => console.log('request to create exclude', {id, type, obj})}
                onPinChange={ (id, type, obj, status) => console.log('request to change whether pinned', {id, type, obj, status})}

                hideNull={true}
                selectedColumns={ //null => all
                  {
                    'field1': true,
                    'field2': true,
                    'field3': true,
                    'field5': true,
                    'field10': true
                  }
                }

                labels={[
                  {
                    type: 'point',
                    id: 'bullwinkle',
                    title: "the greatest moose",

                    showFull: true, // expanded when :hover or .on
                    pinned: true,

                    x: 100,
                    y: 200,

                    fields: {


                    }
                }

              ]}/>
            <Scene data={scene}
                   mouseMove={sceneMouseMove}
                   touchStart={sceneTouchStart}
                   selectToolbarItem={selectToolbarItem}
                   onSelectedPointTouchStart={onSelectedPointTouchStart}
                   onSelectionMaskTouchStart={onSelectionMaskTouchStart}/>
            <Panel side='left' data={left} isOpen={isLeftPanelOpen}/>
            <Dock fluid={false}
                  size={300}
                  defaultSize={300}
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
        sceneMouseMove,
        sceneTouchStart,
        selectToolbarItem,
        onSelectedPointTouchStart,
        onSelectionMaskTouchStart,
    }
)(View);

export { View };
