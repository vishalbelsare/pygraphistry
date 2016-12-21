export class PivotTemplate {
    constructor({ id, name, tags, pivotParameterKeys, pivotParametersUI }) {
        this.id = id;
        this.name = name;
        this.tags = tags;
        this.pivotParametersUI = Object.entries(pivotParametersUI)
            .map(([parameter, values]) => ({ id: `${id}-${parameter}`, ...values }))
            .reduce((result, parameter) => {
                result[parameter.id] = parameter;
                return result
            },{});

        this.pivotParameterKeys = Object.keys(this.pivotParametersUI)

    }
}
