import { container } from '@graphistry/falcor-react-redux';
import {
    ref as $ref
} from '@graphistry/falcor-json-graph';
import {
    tcell as tableCellClassName,
} from './styles.less';
import {
    setPivotAttributes
} from '../actions/pivotRow';
import {
    Badge,
    Button,
    ButtonGroup,
    ControlLabel,
    Form,
    FormControl,
    FormGroup,
    Glyphicon,
    OverlayTrigger,
    Tooltip,
    Popover
} from 'react-bootstrap';
import DateRangePickerWrapper from './TimeRangeWidget.js';
import RcSwitch from 'rc-switch';
import styles from './styles.less';
import _ from 'underscore';
import React from 'react'
import Select from 'react-select';


function Actions({ index, investigationId, splicePivot, searchPivot, insertPivot, status, numRows }) {
    return (
        <div>
        <ButtonGroup>
            <OverlayTrigger placement="top" overlay={
                <Tooltip id={`tooltipActionPlay_${index}`}>Run step</Tooltip>
            } key={`${index}: entityRowAction_${index}`}>
                <Button onClick={() => searchPivot({ index, investigationId })} disabled={status.searching}>
                    {
                        status.searching ? <Glyphicon glyph="hourglass" /> : <Glyphicon glyph="play" />
                    }
                </Button>
            </OverlayTrigger>
        </ButtonGroup>
        <ButtonGroup style={{marginLeft: '0.7em'}}>
            <OverlayTrigger placement="top" overlay={
                <Tooltip id={`tooltipActionAdd_${index}`}>Insert new step after</Tooltip>
            } key={`${index}: entityRowAction_${index}`}>
                <Button onClick={() => insertPivot({index})}><Glyphicon glyph="plus-sign" /></Button>
            </OverlayTrigger>
        </ButtonGroup>
        <ButtonGroup style={{marginLeft: '0.7em'}}>
            <OverlayTrigger placement="top" overlay={
                <Tooltip id={`tooltipActionDelete_${index}`}>Delete step</Tooltip>
            } key={`${index}: entityRowAction_${index}`}>
                <Button disabled={index === 0 && numRows === 1} onClick={() => splicePivot({ index })}><Glyphicon glyph="trash" /></Button>
            </OverlayTrigger>
        </ButtonGroup>
        {
            status.ok ? null
                :
                <ButtonGroup style={{marginLeft: '0.7em'}}>
                    <OverlayTrigger placement="top" trigger="click" rootClose overlay={
                        <Popover id={`tooltipActionError_${index}`} title={status.title} className={styles['pivot-error-tooltip']}>
                            <span style={{color: 'red'}}>{status.message}</span>
                        </Popover>
                    } key={`${index}: entityRowAction_${index}`}>
                        <Button bsStyle="danger">
                            <Glyphicon glyph="warning-sign" />
                        </Button>
                    </OverlayTrigger>
                </ButtonGroup>
        }{
            status.info === true ?
                <ButtonGroup style={{marginLeft: '0.7em'}}>
                    <OverlayTrigger placement="top" trigger="click" rootClose overlay={
                        <Popover id={`tooltipActionInfo_${index}`} title={status.title} className={styles['pivot-info-tooltip']}>
                            <span>{ status.message }</span>
                        </Popover>
                    } key={`${index}: entityRowAction_${index}`}>
                        <Button bsStyle="info">
                            <Glyphicon glyph="info-sign" />
                        </Button>
                    </OverlayTrigger>
                </ButtonGroup>
                : null
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
        const {fldKey, investigationId} = this.props;
        return this.props.setPivotAttributes({
            [`pivotParameters.${fldKey}`]: value
        }, investigationId);
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

function renderTemplateSelector (id, investigationId, pivotTemplate, templates, setPivotAttributes) {
    return (
        <span className={styles.pivotTypeSelectorContainer}>
            <Select
                id={"templateSelector" + id}
                name={"templateSelector" + id}
                clearable={false}
                backspaceRemoves={false}
                value={{value: pivotTemplate.id, label: pivotTemplate.name}}
                options={
                    templates.map(({name, id}) => {
                        return {value: id, label: name};
                    })
                }
                onChange={ ({value}) => {
                    return setPivotAttributes({
                        'pivotTemplate': $ref(`templatesById['${value}']`)
                    }, investigationId)
                }
                }
            />
        </span>
    );
}

function renderTextCell(id, investigationId, paramKey, paramValue, paramUI, handlers) {
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
                    }, investigationId)
                }
            />
        </div>
     );
}

// The combo box compenents only handles string values. We stringify the default value
// and the list of options and parse then back when updating the falcor model.
function renderPivotCombo(id, investigationId, paramKey, paramValue, paramUI, previousPivots, handlers) {
    let options =
        [
            {
                value: JSON.stringify(previousPivots.map(({ id }) => id)),
                label: previousPivots.length > 1 ? 'All Pivots': 'Step 0'
            }
        ];

    if (previousPivots.length > 1) {
        options = options.concat(
            previousPivots.map((pivot, index) =>
                ({
                    value: JSON.stringify([ pivot.id ]),
                    label: `Step ${index}`
                })
            )
        );
    }

    // Wrap setPivotAttributes to parse back the selected item.
    const originalSPA = handlers.setPivotAttributes;
    const stringifiedSPA = (params, investId) => {
        return originalSPA(
            _.mapObject(params, stringifiedArray => JSON.parse(stringifiedArray)
            ), investId
        );
    };

    return renderComboCell(
        id,
        investigationId,
        paramKey,
        JSON.stringify(paramValue),
        {options: options, ...paramUI},
        { setPivotAttributes: stringifiedSPA }
    );
}


function renderComboCell(id, investigationId, paramKey, paramValue, paramUI, handlers) {
    return (
        <ComboSelector
            key={`pcell-${id}-${paramKey}`}
            investigationId={investigationId}
            pivotId={id}
            fldKey={paramKey}
            fldValue={paramValue}
            setPivotAttributes={handlers.setPivotAttributes}
            paramUI={paramUI}
            options={paramUI.options}
        />
    );
}

function renderMultiCell(id, investigationId, paramKey, paramValue, paramUI, handlers) {
    return (
        <div key={`pcell-${id}-${paramKey}`} className={tableCellClassName}>
            <label>{ paramUI.label }</label>
            <Select
                id={`selector-${id}-${paramKey}`}
                name={`selector-${id}-${paramKey}`}
                clearable={true}
                labelKey="name"
                valueKey="id"
                value={paramValue}
                options={paramUI.options}
                multi="true"
                joinValues="true"
                onChange={ (selected) =>
                    handlers.setPivotAttributes({
                        [`pivotParameters.${paramKey}`]: _.pluck(selected, 'id')
                    }, investigationId)
                }/>
        </div>
    )
}

function renderDateRange(id, investigationId, paramKey, paramValue, paramUI, handlers) {
    return (
        <div key={`pcell-${id}-${paramKey}`}>
            <DateRangePickerWrapper
                paramUI={paramUI}
                paramValue={paramValue}
                paramKey={paramKey}
                setPivotAttributes={handlers.setPivotAttributes}
            />
        </div>
    );
}

function renderPivotCell(id, investigationId, paramKey, paramValue, paramUI, previousPivots, handlers) {
    switch (paramUI.inputType) {
        case 'text':
            return renderTextCell(id, investigationId, paramKey, paramValue, paramUI, handlers);
        case 'pivotCombo':
            return renderPivotCombo(id, investigationId, paramKey, paramValue, paramUI, previousPivots, handlers);
        case 'combo':
            return renderComboCell(id, investigationId, paramKey, paramValue, paramUI, handlers);
        case 'multi':
            return renderMultiCell(id, investigationId, paramKey, paramValue, paramUI, handlers);
        case 'daterange':
            return renderDateRange(id, investigationId, paramKey, paramValue, paramUI, handlers);
        default:
            throw new Error('Unknown pivot cell type:' + paramUI.inputType);
    }
}

function renderPivotRow({
    id, investigationId, status, enabled, resultCount, resultSummary, pivotParameters, pivotTemplate, templates,
    searchPivot, togglePivots, setPivotAttributes, splicePivot, insertPivot, pivots, rowIndex })
{
    const handlers = {searchPivot, togglePivots, setPivotAttributes, splicePivot, insertPivot};

    const previousPivots = pivots.slice(0, rowIndex);

    return (
        <tr id={"pivotRow" + id} className={styles['row-toggled-' + (enabled ? 'on' : 'off')]}>
            <td className={styles.pivotToggle}>
                <span>{ rowIndex }</span>
                <RcSwitch defaultChecked={false}
                          checked={enabled}
                          checkedChildren={'On'}
                          onChange={(enabled) => {
                              const indices = enabled ? _.range(0, rowIndex + 1)
                                                      : _.range(rowIndex, pivots.length);
                              togglePivots({indices, enabled, investigationId});
                          }}
                          unCheckedChildren={'Off'}
                />
            </td>
            <td key={`pcell-${id}-pivotselector`} className={styles.pivotData0 + ' pivotTypeSelector'}>
                {
                    pivotTemplate && templates &&
                    renderTemplateSelector(id, investigationId, pivotTemplate, templates, setPivotAttributes)
                }
            </td>

            <td key={`pcell-${id}-pivotparam`} className={styles['pivotData1']}>
            {
                pivotTemplate && pivotTemplate.pivotParameterKeys && pivotTemplate.pivotParametersUI &&
                pivotTemplate.pivotParameterKeys.map(key =>
                        renderPivotCell(
                            id, investigationId, key, pivotParameters[key], pivotTemplate.pivotParametersUI[key],
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
                {
                    resultSummary && renderEntitySummaries(id, resultSummary)
                }
            </td>
            <td className={styles.pivotIcons}>
                <Actions investigationId={investigationId} index={rowIndex} resultCount={resultCount} searchPivot={searchPivot}
                    insertPivot={insertPivot} splicePivot={splicePivot} status={status} numRows={pivots.length}/>
            </td>
        </tr>
    );
}

function mapStateToFragment({pivotTemplate = {pivotParameterKeys: []}} = {}) {
    const baseFields = ['enabled', 'status', 'resultCount', 'resultSummary', 'id'];
    const ppKeys = pivotTemplate.pivotParameterKeys || [];

    if (ppKeys.length === 0) {
        return `{
            ${baseFields.join(',')},
            pivotTemplate: {
                'id', 'name', 'tags',
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
            'id', 'name', 'tags',
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
    }
})(renderPivotRow);
