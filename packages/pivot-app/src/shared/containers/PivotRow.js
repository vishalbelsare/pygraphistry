import { container } from '@graphistry/falcor-react-redux';
import {
    tcell as tableCellClassName,
    splice as spliceIconClassName,
    insert as insertIconClassName,
    search as searchIconClassName
} from './styles.less';
import {
    togglePivot,
    setPivotParameters
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
import PivotTemplates from '../models/pivotTemplates';
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

class InputSelector extends React.Component {
    constructor(props, context) {
        super(props, context)
    }

    componentWillMount() {
        const setPivotParameters = this.props.setPivotParameters;
        const fldValue = this.props.fldValue;
        if (!fldValue) {
            setPivotParameters({input: this.props.previousPivots.map((pivot) => pivot.id).join(' , ')});
        }
    }

    render() {
        const previousPivots = this.props.previousPivots;
        const label = this.props.label;
        const setPivotParameters = this.props.setPivotParameters;
        const fldValue = this.props.fldValue;
        return (
            <Form inline>
                <FormGroup controlId={'inputSelector'}>
                    <ControlLabel>{ label }</ControlLabel>
                    <FormControl
                        componentClass="select"
                        placeholder="select"
                        value={fldValue}
                        onChange={
                            (ev) => (ev.preventDefault() || setPivotParameters({input: ev.target.value}))
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

function PivotSelector (id, field, fldValue, pivotNames, setPivotParameters) {
    return <span className={styles.pivotTypeSelectorContainer}>
        <Select
            id={"pivotTypeSelector" + id}
            name={"pivotTypeSelector" + id}
            value="one"
            clearable={false}
            backspaceRemoves={false}
            value={{value: fldValue, label: fldValue}}
            options={
                pivotNames.map((name, index) => {
                    return {value: name, label: name};
                })
            }
            onChange={ ({value}) => setPivotParameters({'mode': value}) }
        />
    </span>;
}



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
                                    <InputSelector fldValue={fldValue} setPivotParameters={setPivotParameters} label={template.label} previousPivots={previousPivots}/>
                                </div>
                        </td>);
                default:
                    throw new Error('Unkown template kind ' + template.kind);
            }
        default:
            return (<td key={`${id}: ${fldIndex}`} className={styles['pivotData' + fldIndex]}></td>);
    }
};


function renderPivotRow({id, status, rowIndex, enabled, resultCount, resultSummary,
                         pivotParameters, pivotParameterKeys, searchPivot, togglePivot,
                         setPivotParameters, splicePivot, insertPivot, pivots}) {

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
                  unCheckedChildren={'Off'}/>
            </td>
            {
                pivotParameters && pivotParameterKeys.map((key, index) =>
                    renderPivotCellByIndex(
                        key, index, pivotParameters[key], pivotParameters['mode'], id, rowIndex, resultSummary, pivots,
                        searchPivot, togglePivot, setPivotParameters, splicePivot, insertPivot
                    )
                )
            }
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

function mapStateToFragment({pivotParameterKeys = [], pivotParameters = {}} = {}) {
    return `{
        'enabled', 'status', 'resultCount', 'resultSummary', 'id',
        pivotParameterKeys: {
            'length', [0...${pivotParameterKeys.length}]
        }
        ${
            pivotParameterKeys.length > 0 ?
                `,pivotParameters: {
                    ${pivotParameterKeys.join(',')}
                }` :
                ''
        }
    }`;
}

function mapFragmentToProps(fragment) {
    const props = ['id', 'status', 'enabled', 'resultCount', 'resultSummary',
                   'pivotParameters', 'pivotParameterKeys'];
    return _.pick(fragment, props);
}

export default container(
    mapStateToFragment,
    mapFragmentToProps,
    {
        setPivotParameters: setPivotParameters,
        togglePivot: togglePivot
    }
)(renderPivotRow);
