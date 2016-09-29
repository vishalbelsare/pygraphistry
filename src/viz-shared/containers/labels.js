import { container } from '@graphistry/falcor-react-redux';

let Labels = ({ edges, points }) => {
    return (
        <h1>LABELS</h1>
    )
};

Labels = container(
    ({ edges = [], points = [] } = {}) => `{
        id, name,
        selection, timeZone,
        opacity, enabled, poiEnabled,
        ['background', 'foreground']: { color },
        edges: { length, [0...${edges.length || 0}]  },
        points: { length, [0...${points.length || 0}] }
    }`
)(Labels);

export { Labels }
