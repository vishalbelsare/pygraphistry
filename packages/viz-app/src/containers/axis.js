import { container } from '@graphistry/falcor-react-redux';
import { Axis as AxisComponent } from 'viz-app/components/axis';

const emptyArr = [];
const Axis = container({
    renderLoading: false,
    fragment: () => `{
        encodings: {
            point: { axis }
        }
    }`,
    mapFragment: ({ encodings }) => ({
        axis: encodings &&
              encodings.point &&
              encodings.point.axis &&
              encodings.point.axis.rows || emptyArr
    })
})(AxisComponent);

export { Axis }
