import { Options, Option } from './';
import { container } from '@graphistry/falcor-react-redux';
import { setControlValue } from 'viz-app/actions/settings';

export const withSettingsContainer = container({
    renderLoading: true,
    fragment: ({ settings = [] } = {}) => `{
        id, name, settings: ${
            Options.fragments(settings)
        }
    }`
});

export const withOptionsContainer = container({
    renderLoading: true,
    fragment: (options = []) => `{
        name, ...${
            Option.fragments(options)
        }
    }`,
    mapFragment: (options) => ({
        options, name: options.name
    })
});

export const withOptionContainer = container({
    renderLoading: true,
    fragment: () => `{
        id, name, type, props, value: {${null}}
    }`,
    dispatchers: {
        setValue: setControlValue
    }
});
