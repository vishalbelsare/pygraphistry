import logger from '../../../shared/logger.js';
const log = logger.createLogger(__filename);


export const OVERRIDE_WHITELIST = ['placeholder', 'options', 'isVisible'];


export class PivotTemplate {
    constructor({ id, name, tags, parameters }) {
        this.id = id;
        this.name = name;
        this.tags = tags;
        this.parameters = parameters;
        this.pivotParametersUI = this.addTemplateNamespace(id, parameters);
        this.pivotParameterKeys = Object.keys(this.pivotParametersUI)
    }


    derive(settings) {
        if (!('id' in settings) || !('name' in settings)) {
            throw new Error(`Expected fields 'id' and 'name' for system template 
                ${JSON.stringify(settings)}`);
        }

        const template = {};
        template.__proto__ = this;
        /*
        for (let fld in this) {
            template[fld] = this[fld];
        } 
        */   

        //order sensitive
        template.override('name', settings['name']);
        template.override('id', settings['id']);

        for (let fld in settings) {
            if (!(fld in ['id', 'name'])) {
                template.override(fld, settings[fld]);
            }
        }

        return template;
    }


    //User may derive a new template by overriding:
    //  name, id <-- order sensitive, and before rest of parameters
    //  parameters: cannot add new param; can only override param settings in whitelist
    override(k, v) {
        switch (k) {
            case 'name':
                this.name = v;
                return;
            case 'id':
                //TODO how do we guarantee a stable & unique across runs?
                this.id = v;
                this.pivotParametersUI = this.addTemplateNamespace(this.id, this.parameters);
                return;
            case 'parameters':                
                v
                    .map((parameter) => ({id: this.tagTemplateNamespace(this.id, parameter.name), ...parameter}))
                    .forEach((parameter) => {
                        if (parameter.id in this.pivotParametersUI) {
                            for (let setting in parameter) {
                                if (setting in OVERRIDE_WHITELIST) {
                                    this.pivotParametersUI[parameter.id].value = parameter[setting];
                                }
                            }
                        } else {
                            throw new Error(`Unknown parameter ${parameter.name} for pivot ${this.id} (${this.name})`);
                        }
                    });
                return;
            case 'tags':
            case 'nodes':
            case 'attributes':
                this[k] = v;
                return;
            default:
                log.error(`Trying to override unknown template field ${k} ${v}
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
