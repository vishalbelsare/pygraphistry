import { container } from '@graphistry/falcor-react-redux';
import { Settings } from 'viz-shared/containers/settings';

let Labels = ({ edges, points }) => {
    return (
        <h1>LABELS</h1>
    )
};

Labels = container(
    ({ edges = [], points = [], settings } = {}) => `{
        id, name,
        selection, timeZone,
        opacity, enabled, poiEnabled,
        ['background', 'foreground']: { color },
        edges: { length, [0...${edges.length || 0}]  },
        points: { length, [0...${points.length || 0}] },
        ...${ Settings.fragment({ settings }) }
    }`
)(Labels);

export { Labels }
