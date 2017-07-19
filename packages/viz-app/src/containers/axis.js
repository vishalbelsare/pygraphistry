import { container } from '@graphistry/falcor-react-redux';

import { labelMouseMove } from 'viz-app/actions/labels';
import { Axis as AxisComponent } from 'viz-app/components/axis';


const AxisReact = ({
                labelMouseMove,
                renderer,
                encodings,
                ...props }) => {


    return (<AxisComponent encodings={encodings} />);
};


const Axis = container({
    renderLoading: false,
    fragment: ({ settings } = {}) => `{
        id, name,
        encodings: {
            point: { axis }
        }
    }`,
    dispatchers: { labelMouseMove, }
})(AxisReact);

export { Axis }
