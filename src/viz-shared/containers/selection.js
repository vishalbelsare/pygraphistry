import { toProps } from '@graphistry/falcor';
import { container } from '@graphistry/falcor-react-redux';
import SelectionComponent from 'viz-shared/components/selection';

let Selection = ({ rect = {}, ...props }) => {
    return (
        <SelectionComponent rect={toProps(rect)} {...props}/>
    )
};

Selection = container(
    ({ edge = [], point = [] } = {}) => `{
        rect, type,
        edge: { length, [0...${edge.length || 0}] },
        point: { length, [0...${point.length || 0}] }
    }`
)(Selection);

export { Selection };
