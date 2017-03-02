import { container } from '@graphistry/falcor-react-redux';
import { setControlValue } from 'viz-app/actions/settings';

export const withControlContainer = container({
    renderLoading: true,
    fragment: () => `{
        id, name, type, props, value: {${null}}
    }`,
    dispatchers: {
        setValue: setControlValue
    }
});
