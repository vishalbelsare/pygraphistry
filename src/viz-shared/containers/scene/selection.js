import { connect } from 'reaxtor-redux';

export const Selection = connect(
    ({ edge = [], point = [] } = {}) => `{
        rect, type, label,
        edge: { length, [0...${edge.length}] },
        point: { length, [0...${point.length}] }
    }`
)(renderSelection);

function renderSelection({ edge, point }) {
    return (
        <h1>SELECTION</h1>
    )
}
