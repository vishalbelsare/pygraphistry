import { container } from '@graphistry/falcor-react-redux';
import {
    ref as $ref,
    pathValue as $pathValue
} from '@graphistry/falcor-json-graph';
import {
    tcell as tableCellClassName,
    splice as spliceIconClassName,
    insert as insertIconClassName,
    search as searchIconClassName
} from './styles.less';
import {
    togglePivot,
    setPivotAttributes
} from '../actions/PivotRow';
import {
    Badge,
    Button,
    ButtonGroup,
    ControlLabel,
    DropdownButton,
    Form,
    FormControl,
    FormGroup,
    Glyphicon,
    HelpBlock,
    MenuItem,
    OverlayTrigger,
    Tooltip,
    Alert
} from 'react-bootstrap'
import RcSwitch from 'rc-switch';
import styles from './styles.less';
import _ from 'underscore';
//import PivotTemplates from '../models/PivotTemplates';
import React from 'react'
import Select from 'react-select';


function ResultCount({ index, resultCount, splicePivot, searchPivot, insertPivot }) {
    return (
        <div>
        <ButtonGroup>
            <OverlayTrigger placement="top" overlay={
                <Tooltip id={`tooltipActionPlay_${index}`}>Run step</Tooltip>
            } key={`${index}: entityRowAction_${index}`}>
                <Button onClick={(ev) => searchPivot({index})}><Glyphicon glyph="play" /></Button>
            </OverlayTrigger>
        </ButtonGroup>
        <ButtonGroup style={{marginLeft: '0.7em'}}>
            <OverlayTrigger placement="top" overlay={
                <Tooltip id={`tooltipActionAdd_${index}`}>Insert new step after</Tooltip>
            } key={`${index}: entityRowAction_${index}`}>
                <Button onClick={(ev) => insertPivot({index})}><Glyphicon glyph="plus-sign" /></Button>
            </OverlayTrigger>
        </ButtonGroup>
        <ButtonGroup style={{marginLeft: '0.7em'}}>
            <OverlayTrigger placement="top" overlay={
                <Tooltip id={`tooltipActionDelete_${index}`}>Delete step</Tooltip>
            } key={`${index}: entityRowAction_${index}`}>
                <Button disabled={index === 0} onClick={(ev) => splicePivot({index})}><Glyphicon glyph="trash" /></Button>
            </OverlayTrigger>
        </ButtonGroup>
        </div>
    );
}

function renderEntitySummaries (id, resultSummary) {
    return (<div className={styles.pivotEntitySummaries}>
        {
            _.sortBy(resultSummary.entities, (summary) => summary.name)
             .map(({name, count, color}, index)=>(
                <OverlayTrigger  placement="top" overlay={
                    <Tooltip id={`tooltipEntity_${id}_${index}`}>{name}</Tooltip>
                } key={`${index}: entitySummary_${id}`}>
                <span className={styles.pivotEntitySummary}>
                        <span style={{backgroundColor: color}} className={styles.pivotEntityPill}></span>
                        <span className={styles.pivotEntityName}>{count}</span>
                </span>
                </OverlayTrigger>))
        }
        </div>);
}

class InputSelector extends React.Component {
    constructor(props, context) {
        super(props, context)
    }

    componentWillMount() {
        const setPivotAttributes = this.props.setPivotAttributes;
        const fldValue = this.props.fldValue;
        if (!fldValue) {
            setPivotAttributes({
                'pivotParameters.input': this.props.previousPivots.map((pivot) => pivot.id).join(' , ')
            });
        }
    }

    render() {
        const previousPivots = this.props.previousPivots;
        const label = this.props.label;
        const setPivotAttributes = this.props.setPivotAttributes;
        const fldValue = this.props.fldValue;
        const fldKey = this.props.fldKey;
        return (
            <Form inline>
                <FormGroup controlId={'inputSelector'}>
                    <ControlLabel>{ label }</ControlLabel>
                    <FormControl
                        componentClass="select"
                        placeholder="select"
                        value={fldValue}
                        onChange={
                            (ev) => ev.preventDefault() ||
                                setPivotAttributes({[`pivotParameters.${fldKey}`]: ev.target.value})
                        }>
                        <option
                            key={'*'}
                            value={'*'}>  All Pivots
                        </option>
                        {
                            previousPivots.map((pivot, index) => (
                                <option
                                    key={`${pivot.id} + ${index}`}
                                    value={`${pivot.id}`}> { `Step ${index}` }
                                </option>
                            ))
                        }
                    </FormControl>
                </FormGroup>
            </Form>
        )
    }

}

function renderTemplateSelector (id, pivotTemplate, templates, setPivotAttributes) {
    return <span className={styles.pivotTypeSelectorContainer}>
        <Select
            id={"templateSelector" + id}
            name={"templateSelector" + id}
            value="one"
            clearable={false}
            backspaceRemoves={false}
            value={{value: pivotTemplate.id, label: pivotTemplate.name}}
            options={
                templates.map(({name, id}) => {
                    return {value: id, label: name};
                })
            }
            onChange={ ({value}) =>
                setPivotAttributes({
                    'pivotTemplate': $ref(`templatesById['${value}']`)
                })
            }
        />
    </span>;
}


/*
function renderPivotCellByIndex (field, fldIndex, fldValue, mode,
    id, rowIndex, resultSummary, pivots, searchPivot, togglePivot, setPivotParameters, splicePivot, insertPivot) {

    //TODO instead of 'all', use investigation's template's pivotset
    const template = PivotTemplates.get('all', mode);

    switch (fldIndex) {
        case 0:

            const pivotNames = PivotTemplates.templatePivotNames('all');
            return (<td key={`${id}: ${fldIndex}`} className={styles.pivotData0 + ' pivotTypeSelector'}>
                    { PivotSelector(id, field, fldValue, pivotNames, setPivotParameters) }
                </td>);

        case 1:
            switch (template.kind) {
                case 'text':
                    return (<td key={`${id}: ${fldIndex}`} className={styles['pivotData' + fldIndex]}>
                        <div className={tableCellClassName}>
                            <label>{template.label}</label> <input
                                type='th'
                                defaultValue={fldValue}
                                readOnly={false}
                                disabled={false}
                                onChange={
                                    (ev) => (ev.preventDefault() || setPivotParameters({[field]: ev.target.value}))
                                }
                            />
                        </div>
                    </td>);
                case 'button':
                    const previousPivots = pivots.slice(0, rowIndex);
                    return (<td key={`${id}: ${fldIndex}`} className={styles['pivotData' + fldIndex]}>
                                <div>
                                    <InputSelector fldValue={fldValue}
                                                   setPivotParameters={setPivotParameters}
                                                   label={template.label} previousPivots={previousPivots}/>
                                </div>
                        </td>);
                default:
                    throw new Error('Unkown template kind ' + template.kind);
            }
        default:
            return (<td key={`${id}: ${fldIndex}`} className={styles['pivotData' + fldIndex]}></td>);
    }
};
*/

function renderTextCell(id, paramKey, paramValue, paramUI, handlers) {
     return (

                <div className={tableCellClassName}>
                    <label>{ paramUI.label }</label>
                    <input
                        type='th'
                        defaultValue={paramValue}
                        placeholder={paramUI.placeholder}
                        readOnly={false}
                        disabled={false}
                        onChange={ev => ev.preventDefault() ||
                            handlers.setPivotAttributes({
                                [`pivotParameters.${paramKey}`]: ev.target.value
                            })
                        }
                    />
                </div>
     );
}

function renderPivotCombo(id, paramKey, paramValue, paramUI, previousPivots, handlers) {
    return (
            <InputSelector
                fldKey={paramKey}
                fldValue={paramValue}
                setPivotAttributes={handlers.setPivotAttributes}
                label={paramUI.label}
                previousPivots={previousPivots}
            />
    );
}

function renderPivotCell(id, paramKey, paramValue, paramUI, previousPivots, handlers) {
    switch (paramUI.inputType) {
        case 'text':
            return renderTextCell(id, paramKey, paramValue, paramUI, handlers);

        case 'pivotCombo':
            return renderPivotCombo(id, paramKey, paramValue, paramUI, previousPivots, handlers);
        default:
            throw new Error('Unknown pivot cell type:' + paramUI.inputType);
    }
}

function renderStatusIndicator(status) {
    if (status.ok) {
        return (<div/>);
    } else {
        return (
            <Alert bsStyle={'danger'} className={styles.alert}>
                <strong> {status.message} </strong>
            </Alert>
        );
    }
}

function renderPivotRow({
    id, status, enabled, resultCount, resultSummary, pivotParameters, pivotTemplate, templates,
    searchPivot, togglePivot, setPivotAttributes, splicePivot, insertPivot, pivots, rowIndex })
{
    const handlers = {searchPivot, togglePivot, setPivotAttributes, splicePivot, insertPivot}
    const previousPivots = pivots.slice(0, rowIndex);

    return (
        <tr id={"pivotRow" + id} className={styles['row-toggled-' + (enabled ? 'on' : 'off')]}>
            <td className={styles.pivotToggle}>
                <span>{ rowIndex }</span>
                <RcSwitch defaultChecked={false}
                          checked={enabled}
                          checkedChildren={'On'}
                          onChange={(ev) => {
                              togglePivot({ rowIndex, enabled: ev })}
                          }
                          unCheckedChildren={'Off'}
                />
            </td>
            <td key={`pcell-${id}-pivotselector`} className={styles.pivotData0 + ' pivotTypeSelector'}>
                { renderTemplateSelector(id, pivotTemplate, templates, setPivotAttributes) }
            </td>

            <td key={`pcell-${id}-pivotparam`} className={styles['pivotData1']}>
            {
                pivotTemplate.pivotParameterKeys && pivotTemplate.pivotParameterKeys.map(key =>
                    renderPivotCell(
                        id, key, pivotParameters[key], pivotTemplate.pivotParametersUI[key],
                        previousPivots, handlers
                    )
                )
            }
            </td>
            <td className={styles.pivotResultCount}>
                <OverlayTrigger  placement="top" overlay={
                    <Tooltip id={`resultCountTip_${id}_${rowIndex}`}>Events</Tooltip>
                } key={`${rowIndex}: entitySummary_${id}`}>
                    <Badge> {resultCount} </Badge>
                </OverlayTrigger>
            </td>
            <td className={styles.pivotResultSummaries + ' ' + styles['result-count-' + (enabled ? 'on' : 'off')]}>
                    { renderEntitySummaries(id, resultSummary) }
            </td>
            <td className={styles.pivotIcons}>
                <ResultCount index={rowIndex} resultCount={resultCount} searchPivot={searchPivot}
                    insertPivot={insertPivot} splicePivot={splicePivot}/>
                { renderStatusIndicator(status) }
            </td>
        </tr>
    );
}

function mapStateToFragment({pivotTemplate = {pivotParameterKeys: []}} = {}) {
    const baseFields = ['enabled', 'status', 'resultCount', 'resultSummary', 'id'];
    const ppKeys = pivotTemplate.pivotParameterKeys || [];
    console.log('ppkeys', ppKeys);

    if (ppKeys.length === 0
        || _.keys(ppKeys).length <= 1) {
        return `{
            ${baseFields.join(',')},
            pivotTemplate: {
                pivotParameterKeys: {
                    'length',
                    [0...${ppKeys.length}]
                }
            }
        }`;
    }

    return `{
        ${baseFields.join(',')},
        pivotTemplate: {
            'id', 'name',
            pivotParameterKeys: {
                'length',
                [0...${ppKeys.length}]
            },
            pivotParametersUI: {
                ${ppKeys.join(',')}
            }
        },
        pivotParameters: {
            ${ppKeys.join(',')}
        }
    }`;
}

function mapFragmentToProps(fragment) {
    const props = [
        'id', 'status', 'enabled', 'resultCount', 'resultSummary',
        'pivotParameters', 'pivotTemplate'
    ];

    console.log('frag', fragment);
    return _.extend({pivotParameters:{}}, _.pick(fragment, props));
}

export default container(
    mapStateToFragment,
    mapFragmentToProps,
    {
        setPivotAttributes: setPivotAttributes,
        togglePivot: togglePivot
    }
)(renderPivotRow);
