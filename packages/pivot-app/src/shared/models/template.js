import _ from 'underscore';


const defaults  = {
    name: 'Untitled pivot',
    pivotParameterKeys: [],
    pivotParametersUI: {}
};

export function createTemplateModel(pivot) {
    const clientFields = ['id', 'name', 'pivotParameterKeys', 'pivotParametersUI'];
    return {
        ...defaults,
        ..._.pick(pivot, clientFields),
    };
}
