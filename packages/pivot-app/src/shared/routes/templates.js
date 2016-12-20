import { getHandler } from './support';


export function templates({ loadTemplatesById }) {
    const getTemplateHandler = getHandler(['template'], loadTemplatesById);

    return [{
        route: `templatesById[{keys}]['name', 'id']`,
        returns: `String`,
        get: getTemplateHandler
    }, {
        route: `templatesById[{keys}]['tags']`,
        returns: `Array`,
        get: getTemplateHandler
    }, {
        route: `['templatesById'][{keys}]['pivotParameterKeys'].length`,
        returns: `Number`,
        get: getTemplateHandler

    }, {
        route: `templatesById[{keys}]['pivotParameterKeys'][{integers}]`,
        returns: `String`,
        get: getTemplateHandler
    }, {
        route: `templatesById[{keys}]['pivotParametersUI'][{keys}]`,
        returns: `Object`,
        get: getTemplateHandler
    }];
}
