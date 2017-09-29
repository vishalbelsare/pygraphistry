import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);


//Explicit to make user error reporting more fail-fast
export const FIELD_OVERRIDE_WHITELIST = ['id', 'name', 'parameters', 'tags'];
export const PARAM_OVERRIDE_WHITELIST = ['placeholder', 'options', 'isVisible', 'label', 'defaultValue'];
export const PIVOT_KINDS =
    ['bool', 'text', 'number', 'textarea', 'combo', 'multi', 'daterange', 'pivotCombo', 'label']
    .reduce((o,fld) => { o[fld] = true; return o; }, {});


export class PivotTemplate {
    constructor({ id, name, tags = [], parameters = []}) {

        if (!id || !name) {
            throw new Error(`Pivot template expects fields 'id' and 'name', got '${id}' and '${name}'`);
        }

        parameters.forEach((param) => {
            if (!param.name) {
                throw new Error(`Pivot parameters must have fields name, inputType;
                    got "${param.name}", "${param.inputType}"
                    for pivot ${id} ("${name}")`);
            }
            if (!(param.inputType in PIVOT_KINDS)) {
                throw new Error(`Pivot parameter "${param.name}"
                    has unknown inputType value "${param.inputType}"
                    for pivot ${id} ("${name}")`);
            }
        });

        this.id = id;
        this.name = name;
        this.tags = tags;
        this.parameters = parameters;
        this.pivotParametersUI = this.addTemplateNamespace(id, parameters);
        this.pivotParameterKeys = Object.keys(this.pivotParametersUI)
    }

    //Clone, with selective, managed overriding of (untrusted) settings
    clone(settings = {}) {

        Object.keys(settings)
            .filter((fld) => FIELD_OVERRIDE_WHITELIST.indexOf(fld) === -1)
            .map((fld) => {
                throw new Error(`Unexpected setting override of '${fld}'
                    for '${settings.id}' (${settings.name})`);
            });

        const newParameters =
            (settings.parameters||[]).filter((settingParam) =>
                0 === this.parameters.filter((templateParam) =>
                    templateParam.name === settingParam.name).length);

        const template = new PivotTemplate({
            id: settings.id,
            name: settings.name,
            parameters: newParameters.concat(this.parameters),
            tags: settings.tags || this.tags
        });

        this.cloneParameters(template, settings, newParameters);

        return template;
    }

    cloneParameters(template, settings, newParameters) {

        if ('parameters' in settings) {

            const newParametersDict =
                newParameters
                    .reduce((acc, param) => { acc[param.name] = param; return acc; }, {});

            settings.parameters

                //Skip entirely new as they're already handled
                .filter((parameter) => !newParametersDict[parameter.name])

                .map((parameter) => ({id: template.tagTemplateNamespace(template.id, parameter.name), ...parameter}))
                .forEach((parameter) => {
                    Object.keys(parameter)
                        .filter((fld) => ['id', 'name'].indexOf(fld) === -1)
                        .map( (fld) => {
                            if (PARAM_OVERRIDE_WHITELIST.indexOf(fld) === -1) {
                                throw new Error(`Overriding template field ${fld} not allowed
                                    in parameter ${parameter.label}
                                    for pivot ${template.id} (${template.name})`);
                            }
                            return fld;
                        })
                        .forEach((fld) => {
                            template.pivotParametersUI[parameter.id][fld] = parameter[fld];
                        });
                });
        }
    }

    tagTemplateNamespace(id, name) {
        return `${id}$$$${name}`;
    }

    addTemplateNamespace(templateId, parameters) {
        return parameters
            .map((parameter) => ({id: this.tagTemplateNamespace(templateId, parameter.name), ...parameter}))
            .reduce((result, parameter) => {
                result[parameter.id] = parameter;
                return result;
            }, {});
    }

    stripTemplateNamespace(parameters) {
        return Object.entries(parameters)
            .filter(([key]) => key.startsWith(this.id))
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
