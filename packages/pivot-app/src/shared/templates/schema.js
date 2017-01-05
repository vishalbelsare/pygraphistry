import { withSchema } from '@graphistry/falcor-react-schema';

export default withSchema((QL, { get, set }, services) => {

    const { loadTemplatesById } = services;
    const readOnlyHandler = {
        get: get(loadTemplatesById)
    };

    return QL`{
        ['id', 'name', 'tags', 'pivotParameterKeys']: ${
            readOnlyHandler
        },
        pivotParametersUI: {
            [{ keys }]: ${
                readOnlyHandler
            }
        }
    }`;
});
