import React, { PropTypes } from 'react';
import { toProps } from '@graphistry/falcor'
import { Settings } from 'viz-shared/containers/settings';
import { container } from '@graphistry/falcor-react-redux';
import { compose, getContext, hoistStatics } from 'recompose';

let Scene = ({
    Renderer, id,
    highlight = {}, selection = {}, background = {},
    edges = {}, points = {}, camera = {}, ...props
}) => {
    return (
        <div style={{ width: `100%`, height: `100%`, position: `absolute` }}>
            <Renderer
                {...props}
                key='renderer'
                sceneID={id}
                edges={toProps(edges)}
                points={toProps(points)}
                camera={toProps(camera)}
                highlight={toProps(highlight)}
                selection={toProps(selection)}
                background={toProps(background)}
                />
        </div>
    );
};

Scene = compose(
    hoistStatics(getContext({ Renderer: PropTypes.func })),
    container(({ settings, highlight = {}, selection = {} } = {}) => {
        const { edge: hEdge = [], point: hPoint = [] } = highlight;
        const { edge: sEdge = [], point: sPoint = [] } = selection;
        return `{
            id,
            simulating,
            showArrows,
            pruneOrphans,
            ... ${ Settings.fragment({ settings }) },
            camera: { zoom, center: { x, y, z } },
            edges: { scaling, opacity, elements },
            points: { scaling, opacity, elements },
            ['background', 'foreground']: { color },
            highlight: {
                edge: { length, [0...${hEdge.length || 0}] },
                point: { length, [0...${hPoint.length || 0}] }
            },
            selection: {
                type,
                edge: { length, [0...${sEdge.length || 0}] },
                point: { length, [0...${sPoint.length || 0}] }
            }
        }`;
    })
)(Scene);

export { Scene };
