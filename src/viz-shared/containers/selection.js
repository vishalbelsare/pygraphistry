import { toProps } from '@graphistry/falcor';
import { container } from '@graphistry/falcor-react-redux';
import SelectionComponent from 'viz-shared/components/selection';

let Selection = ({ mask = {}, ...props }) => {
    return (
        <SelectionComponent mask={toProps(mask)} {...props}/>
    );
};

Selection = container(
    ({ edge = [], point = [] } = {}) => `{
        mask, type,
        edge: { length, [0...${edge.length || 0}] },
        point: { length, [0...${point.length || 0}] }
    }`
)(Selection);

export { Selection };
