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
} from '../actions/PivotRow';
import {
    Badge,
    Button,
    ButtonGroup,
    ControlLabel,
    DropdownButton,
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
import PivotTemplates from '../models/PivotTemplates';

function ResultCount({ index, resultCount, splicePivot, searchPivot, insertPivot }) {
    return (
        <div>
        <ButtonGroup>
            <Button onClick={(ev) => searchPivot({index})}><Glyphicon glyph="play" /></Button>
            <Button ><Glyphicon glyph="cog" /></Button>
        </ButtonGroup>
        <ButtonGroup style={{marginLeft: '0.7em'}}>
            <Button onClick={(ev) => insertPivot({index})}><Glyphicon glyph="plus-sign" /></Button>
        </ButtonGroup>
        <ButtonGroup style={{marginLeft: '0.7em'}}>
            <Button onClick={(ev) => splicePivot({index})}><Glyphicon glyph="trash" /></Button>
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

function renderPivotCellByIndex (field, fldIndex, fldValue, mode,
    id, rowIndex, resultSummary, searchPivot, togglePivot, setPivotParameters, splicePivot, insertPivot) {

    //TODO instead of 'all', use investigation's template's pivotset
    const template = PivotTemplates.get('all', mode);

    switch (fldIndex) {
        case 0:
            //return <td key={`${id}: ${fldIndex}`} className="pivotTypeSelector">Searcher</td>;

            const pivotNames = PivotTemplates.templatePivotNames('all');

            return (<td key={`${id}: ${fldIndex}`} className={styles.pivotData0 + ' pivotTypeSelector'}>
                    <DropdownButton id={"pivotTypeSelector" + id} title={fldValue}
                        onSelect={
                            (mode, evt) => setPivotParameters({[field]: mode})
                        }
                    >
                        {pivotNames.map((name, index) => {
                            return (<MenuItem eventKey={name} key={`${index}: ${id}`}>
                                {name}
                            </MenuItem>)}
                        )}
                    </DropdownButton>
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
                        { renderEntitySummaries(id, resultSummary) }
                    </td>);
                case 'button':
                    const inputNames = _.range(0, rowIndex).map((i) => "Pivot " + i);
                    return (<td key={`${id}: ${fldIndex}`} className={styles['pivotData' + fldIndex]}>
                            <label>{template.label}</label> <DropdownButton id={"pivotInputSelector" + id}
                                title={fldValue.replace('Pivot', 'Step')}
                                onSelect={
                                    (val, evt) => setPivotParameters({[field]: val})
                                } >
                                {inputNames.map((name, index) => (
                                    <MenuItem eventKey={name} key={`${index}: ${id}`}>
                                        {name.replace('Pivot', 'Step')}
                                    </MenuItem>)
                                )}
                                </DropdownButton>
                            { renderEntitySummaries(id, resultSummary) }
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
                         setPivotParameters, splicePivot, insertPivot}) {

    const statusIndicator =
        status.ok ?
            (<div/>)
        :
            (<Alert bsStyle={'danger'} className={styles.alert}>
                <strong> {status.message} </strong>
            </Alert>)

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
                pivotParameterKeys.map((key, index) =>
                    renderPivotCellByIndex(
                        key, index, pivotParameters[key], pivotParameters['mode'], id, rowIndex, resultSummary,
                        searchPivot, togglePivot, setPivotParameters, splicePivot, insertPivot
                    )
                )
            }
            <td className={styles.pivotResultCount + ' ' + styles['result-count-' + (enabled ? 'on' : 'off')]}>
                    <Badge> {resultCount} </Badge>
            </td>
            <td className={styles.pivotIcons}>
                <ResultCount index={rowIndex} resultCount={resultCount} searchPivot={searchPivot}
                    insertPivot={insertPivot} splicePivot={splicePivot}/>
                {statusIndicator}
            </td>
        </tr>
    );
}

function mapStateToFragment({pivotParameterKeys = [], pivotParameters = {}} = {}) {
    return `{
        'enabled', 'status', 'resultCount', 'resultSummary', 'id',
        pivotParameterKeys: {
            'length', [0...${pivotParameterKeys.length}]
        },
        pivotParameters
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
