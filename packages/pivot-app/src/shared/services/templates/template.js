import logger from '../../../shared/logger.js';
const log = logger.createLogger(__filename);


//Explicit to make user error reporting more fail-fast
export const FIELD_OVERRIDE_WHITELIST = ['id', 'name', 'parameters', 'tags'];
export const PARAM_OVERRIDE_WHITELIST = ['placeholder', 'options', 'isVisible'];


export class PivotTemplate {
    constructor({ id, name, tags = [], parameters = []}) {

        if (!id || !name) {
            throw new Error(`Pivot template expects fields 'id' and 'name', got '${id}' and '${name}'`);
        }

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

        const template = new PivotTemplate({
            id: settings.id,
            name: settings.name,
            parameters: this.parameters,
            tags: settings.tags || this.tags
        });

        if ('parameters' in settings) {
            settings.parameters
                .map((parameter) => ({id: template.tagTemplateNamespace(template.id, parameter.name), ...parameter}))
                .forEach((parameter) => {
                    if (!(parameter.id in template.pivotParametersUI)) {
                        throw new Error(`Unknown parameter ${parameter.name} 
                            for pivot ${template.id} (${template.name})`);
                    }
                    Object.keys(parameter)
                        .filter((fld) => ['id', 'name', 'template'].indexOf(fld) === -1)
                        .map( (fld) => {
                            if (PARAM_OVERRIDE_WHITELIST.indexOf(fld) === -1) {
                                throw new Error(`Overriding template field ${setting} not allowed 
                                    for pivot ${template.id} (${template.name})`);
                            }
                            return fld;
                        })
                        .map((fld) => {
                            template.pivotParametersUI[parameter.id][fld] = parameter[fld];
                        })
                });
        }        

        return template;
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
