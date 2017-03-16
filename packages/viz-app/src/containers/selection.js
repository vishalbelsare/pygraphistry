import { toProps } from '@graphistry/falcor';
import { container } from '@graphistry/falcor-react-redux';
import { Selection as SelectionComponent } from 'viz-app/components/selection';

let Selection = ({ mask = {}, ...props }) => {
    return (
        <SelectionComponent mask={toProps(mask)} {...props}/>
    );
};

Selection = container({
    renderLoading: true,
    fragment: ({ edge = [], point = [] } = {}) => `{
        mask, type, edge, cursor, point, darken
    }`
})(Selection);

export { Selection };
