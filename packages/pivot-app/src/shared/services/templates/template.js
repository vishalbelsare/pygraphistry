import logger from '../../../shared/logger.js';
const log = logger.createLogger(__filename);


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
    clone(settings) {

        const template = new PivotTemplate({
            id: settings.id,
            name: settings.name,
            parameters: this.parameters,            
        });

        for (let fld in settings) {
            if (['id', 'name', 'template'].indexOf(fld) === -1) {
                template.override(fld, settings[fld]);
            }
        }

        return template;
    }


    //User may derive a new template by overriding:
    //  parameters: cannot add new param; can only override param settings in whitelist
    override(k, v) {
        switch (k) {
            case 'parameters':                
                v
                    .map((parameter) => ({id: this.tagTemplateNamespace(this.id, parameter.name), ...parameter}))
                    .forEach((parameter) => {
                        if (!(parameter.id in this.pivotParametersUI)) {
                            throw new Error(`Unknown parameter ${parameter.name} 
                                for pivot ${this.id} (${this.name})`);
                        }
                        Object.keys(parameter)
                            .filter((fld) => ['id', 'name', 'template'].indexOf(fld) === -1)
                            .map( (fld) => {
                                if (PARAM_OVERRIDE_WHITELIST.indexOf(fld) === -1) {
                                    throw new Error(`Overriding template field ${setting} not allowed 
                                        for pivot ${this.id} (${this.name})`);
                                }
                                return fld;
                            })
                            .map((fld) => {
                                this.pivotParametersUI[parameter.id][fld] = parameter[fld];
                            })
                    });
                return;
            case 'tags':
            case 'nodes':
            case 'attributes':
                this[k] = v;
                return;
            default:
                throw new Error(`Trying to override unknown template field ${k} = ${v}
                    when deriving ${this.id} (${this.name})`);                
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
