import { toProps } from '@graphistry/falcor';
import { Selection } from 'viz-app/containers/selection';
import { container } from '@graphistry/falcor-react-redux';
import { Renderer as RendererComponent } from 'viz-app/components/renderer';

let Renderer = (
    {
        highlight = {},
        selection = {},
        background = {},
        axis = {},
        edges = {},
        points = {},
        camera = {},
        ...props
    } = {}
) => {
    return (
        <RendererComponent
            axis={toProps(axis)}
            edges={toProps(edges)}
            points={toProps(points)}
            camera={toProps(camera)}
            highlight={toProps(highlight)}
            selection={toProps(selection)}
            background={toProps(background)}
            {...props}
        />
    );
};

Renderer = container({
    renderLoading: true,
    fragment: ({ highlight = {}, selection = {} } = {}) => `{
        showArrows,
        camera: { zoom, center: { x, y, z } },
        edges: { scaling, opacity, elements },
        points: { scaling, opacity, elements },
        ['background', 'foreground']: { color },
        highlight: ${Selection.fragment(highlight)},
        selection: ${Selection.fragment(selection)}
    }`
})(Renderer);

export { Renderer };
