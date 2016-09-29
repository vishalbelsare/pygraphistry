import React, { PropTypes } from 'react';
import { container } from '@graphistry/falcor-react-redux';
import { compose, getContext, hoistStatics } from 'recompose';

let Scene = ({
    Renderer,
    id, simulating, showArrows, pruneOrphans,
    edges = {}, points = {}, camera = {}, background = {},
}) => {
    return (
        <div style={{ width: `100%`, height: `100%`, position: `absolute` }}>
            <Renderer
                key='renderer'
                edges={{ ...edges }}
                camera={{ ...camera }}
                points={{ ...points }}
                background={{ ...background }}
                sceneID={id} simulating={simulating}
                showArrows={showArrows} pruneOrphans={pruneOrphans}
                />
        </div>
    );
};

Scene = compose(
    hoistStatics(getContext({ Renderer: PropTypes.func })),
    container(() => `{
        id,
        simulating,
        showArrows,
        pruneOrphans,
        camera: { zoom, center },
        edges: { scaling, opacity, elements },
        points: { scaling, opacity, elements },
        ['background', 'foreground']: { color }
    }`)
)(Scene);

export { Scene };
