export class PivotTemplate {
    constructor({ id, name, tags, parameters }) {
        this.id = id;
        this.name = name;
        this.tags = tags;
        this.pivotParametersUI = this.addTemplateNamespace(id, parameters);
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
