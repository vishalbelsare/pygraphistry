import { connect } from 'reaxtor-redux';

export const Labels = connect(
    ({ edge = [], point = [], settings = [] } = {}) => `{
        id, name,
        selection, timeZone,
        opacity, enabled, poiEnabled,
        settings: {
            length, [0...${settings.length}]: {
                id
            }
        },
        ['background', 'foreground']: { color },
        edge: { length, [0...${edge.length}]  },
        point: { length, [0...${point.length}] }
    }`
)(renderLabels);

function renderLabels({ edge, point }) {
    return (
        <h1>LABELS</h1>
    )
}
