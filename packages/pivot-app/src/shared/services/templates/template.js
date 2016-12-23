export class PivotTemplate {
    constructor({ id, name, tags, pivotParameterKeys, pivotParametersUI, parameters }) {
        this.id = id;
        this.name = name;
        this.tags = tags;
        if (parameters) {
            this.pivotParametersUI = this.addTemplateNamespace(id, parameters);
        } else {
            this.pivotParametersUI = Object.entries(pivotParametersUI)
            .map(([parameter, values]) => ({ id: `${id}$$$${parameter}`, ...values }))
            .reduce((result, parameter) => {
                result[parameter.id] = parameter;
                return result
            },{});
        }
        this.pivotParameterKeys = Object.keys(this.pivotParametersUI)
    }

    addTemplateNamespace(templateId, parameters) {
        return parameters
            .map((parameter) => ({id: `${templateId}$$$${parameter.name}`, ...parameter}))
            .reduce((result, parameter) => {
                result[parameter.id] = parameter;
                return result;
            }, {});
    }

    static stripTemplateNamespace(parameters) {
        return Object.entries(parameters)
            .map(([key, value]) =>
                ({
                    key:(key.split('$$$')[1]),
                    value
                })
            )
            .reduce((result, {key, value}) => {
                result[key] = value
                return result
            }, {});
    }
}
