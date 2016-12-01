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
} from '../actions/pivotRow';
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
    Popover,
    Alert
} from 'react-bootstrap'
import RcSwitch from 'rc-switch';
import styles from './styles.less';
import _ from 'underscore';
import React from 'react'
import Select from 'react-select';


function ResultCount({ index, resultCount, splicePivot, searchPivot, insertPivot, status }) {
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
        {
            status.searching ?
                <ButtonGroup style={{marginLeft: '0.7em'}}>
                        <Button>
                            <Glyphicon glyph="refresh" />
                        </Button>
                </ButtonGroup>
            :
            null
        }
        {
            status.ok ? null
                :
                <ButtonGroup style={{marginLeft: '0.7em'}}>
                    <OverlayTrigger placement="top" trigger="click" rootClose overlay={
                        <Popover id={`tooltipActionError_${index}`} title="ERROR RUNNING PIVOT" className={styles['pivot-error-tooltip']}>
                            <span style={{color: 'red'}}>{status.message}</span>
                        </Popover>
                    } key={`${index}: entityRowAction_${index}`}>
                        <Button bsStyle="danger">
                            <Glyphicon glyph="warning-sign" />
                        </Button>
                    </OverlayTrigger>
                </ButtonGroup>


        }
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

class ComboSelector extends React.Component {
    constructor(props, context) {
        super(props, context)
    }

    setParam(value) {
        const {setPivotAttributes, fldKey} = this.props;
        return this.props.setPivotAttributes({
            [`pivotParameters.${fldKey}`]: value
        });
    }

    componentWillMount() {
        const {fldValue, options} = this.props;
        if (!fldValue) {
            this.setParam(options[0].value);
        }
    }

    render() {
        const {
            pivotId,
            setPivotAttributes,
            fldKey,
            fldValue,
            options,
            paramUI,
        } = this.props;
        return (
            <Form inline>
                <FormGroup controlId={'inputSelector'}>
                    <ControlLabel>{ paramUI.label }</ControlLabel>
                    <FormControl
                        componentClass="select"
                        placeholder="select"
                        value={fldValue}
                        onChange={(ev) =>
                            ev.preventDefault() || this.setParam(ev.target.value)
                        }
                    >
                        {
                            options.map(({value, label}, index) => (
                                <option
                                    key={`comboselector-${pivotId}-${fldKey}-${index}`}
                                    value={value}
                                >
                                    { label }
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
    return (
        <span className={styles.pivotTypeSelectorContainer}>
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
        </span>
    );
}

function renderTextCell(id, paramKey, paramValue, paramUI, handlers) {
     return (
        <div className={tableCellClassName} key={`pcell-${id}-${paramKey}`}>
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
    var options =
        [
            {
                value: [previousPivots.map(({ id }) => ( id ))],
                label: 'All pivots'
            }
        ];

    if (previousPivots.length > 1) {
        options = options.concat(
            previousPivots.map((pivot, index) =>
                ({value: [ pivot.id ], label: `Step ${index}`})
            )
        );
    }

    return renderComboCell(
        id,
        paramKey,
        paramValue,
        {options: options, ...paramUI},
        handlers
    );
}


function renderComboCell(id, paramKey, paramValue, paramUI, handlers) {
    return (
        <ComboSelector
            key={`pcell-${id}-${paramKey}`}
            pivotId={id}
            fldKey={paramKey}
            fldValue={paramValue}
            setPivotAttributes={handlers.setPivotAttributes}
            paramUI={paramUI}
            options={paramUI.options}
        />
    );
}

function renderPivotCell(id, paramKey, paramValue, paramUI, previousPivots, handlers) {
    switch (paramUI.inputType) {
        case 'text':
            return renderTextCell(id, paramKey, paramValue, paramUI, handlers);
        case 'pivotCombo':
            return renderPivotCombo(id, paramKey, paramValue, paramUI, previousPivots, handlers);
        case 'combo':
            return renderComboCell(id, paramKey, paramValue, paramUI, handlers);
        default:
            throw new Error('Unknown pivot cell type:' + paramUI.inputType);
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
                {
                    pivotTemplate && templates &&
                    renderTemplateSelector(id, pivotTemplate, templates, setPivotAttributes)
                }
            </td>

            <td key={`pcell-${id}-pivotparam`} className={styles['pivotData1']}>
            {
                pivotTemplate && pivotTemplate.pivotParameterKeys && pivotTemplate.pivotParametersUI &&
                pivotTemplate.pivotParameterKeys.map(key =>
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
                    insertPivot={insertPivot} splicePivot={splicePivot} status={status}/>
            </td>
        </tr>
    );
}

function mapStateToFragment({pivotTemplate = {pivotParameterKeys: []}} = {}) {
    const baseFields = ['enabled', 'status', 'resultCount', 'resultSummary', 'id'];
    const ppKeys = pivotTemplate.pivotParameterKeys || [];

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

    return _.extend({pivotParameters:{}}, _.pick(fragment, props));
}

export default container({
    renderLoading: false,
    fragment: mapStateToFragment,
    mapFragment: mapFragmentToProps,
    dispatchers: {
        setPivotAttributes: setPivotAttributes,
        togglePivot: togglePivot
    }
})(renderPivotRow);
