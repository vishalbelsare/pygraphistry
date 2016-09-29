import { container } from '@graphistry/falcor-react-redux';

export const Selection = container(
    ({ edge = [], point = [] } = {}) => `{
        rect, type, label,
        edge: { length, [0...${edge.length || 0}] },
        point: { length, [0...${point.length || 0}] }
    }`
)(renderSelection);

function renderSelection({ edge, point }) {
    return (
        <h1>SELECTION</h1>
    )
}
