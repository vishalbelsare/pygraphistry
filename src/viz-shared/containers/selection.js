import { container } from '@graphistry/falcor-react-redux';

let Selection = ({ edge, point }) => {
    return (
        <h1>SELECTION</h1>
    )
};

Selection = container(
    ({ edge = [], point = [] } = {}) => `{
        rect, type, label,
        edge: { length, [0...${edge.length || 0}] },
        point: { length, [0...${point.length || 0}] }
    }`
)(Selection);

export { Selection };
