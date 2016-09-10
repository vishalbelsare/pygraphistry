import { container } from '@graphistry/falcor-react-redux';
import { tcell as tableCellClassName,
         splice as spliceIconClassName,
         insert as insertIconClassName,
         search as searchIconClassName } from './styles.less';
import { setPivotValue, togglePivot } from '../actions/PivotRow';
import { Button, Glyphicon, ButtonGroup, Badge, DropdownButton, MenuItem } from 'react-bootstrap'
import RcSwitch from 'rc-switch';
import styles from './styles.less';
import _ from 'underscore';
import PivotTemplates from '../models/PivotTemplates';

function ResultCount({ index, resultCount, splicePivot, searchPivot, insertPivot }) {
    return (
        <div>
        <ButtonGroup style={{float:'right'}} >
            <Button onClick={(ev) => insertPivot({index})}><Glyphicon glyph="plus" /></Button>
            <Button onClick={(ev) => splicePivot({index})}><Glyphicon glyph="minus" /></Button>
            <Button onClick={(ev) => searchPivot({index})}><Glyphicon glyph="search" /></Button>
            <Button ><Glyphicon glyph="calendar" /></Button>
            <Button ><Glyphicon glyph="cog" /></Button>
        </ButtonGroup>
        </div>
    );
}

const fieldToIndex = {
    'Mode': 0,
    'Input': 1,
    'Search': 2
};




function renderPivotCellByIndex (
    field, fldIndex,
    id, rowIndex, enabled, resultCount, length, fields, searchPivot, togglePivot, setPivotValue, splicePivot, insertPivot) {

    switch (fldIndex) {
        case 0:
            //return <td key={`${id}: ${fldIndex}`} className="pivotTypeSelector">Searcher</td>;

            const pivotNames = Object.keys(PivotTemplates.pivots);

            return (<td key={`${id}: ${fldIndex}`} className={styles.pivotData0 + ' pivotTypeSelector'}>
                    <DropdownButton id={"pivotTypeSelector" + id} title={field.value}
                    onSelect={
                        (mode, evt) => {
                            setPivotValue({index: fldIndex, target: mode});
                        }}
                    >
                    {pivotNames.map((name, index) => {
                        return (<MenuItem eventKey={name} key={`${index}: ${id}`}>
                            {name}
                        </MenuItem>)}
                    )}
                    </DropdownButton>
                </td>);

        case 1:
            if (fields[fieldToIndex['Mode']].value === 'Search') {
                return (<td key={`${id}: ${fldIndex}`} className={styles['pivotData' + fldIndex]}>
                    <div className={tableCellClassName}>
                        <input
                            type='th'
                            defaultValue={fields[fieldToIndex['Search']].value}
                            readOnly={false}
                            disabled={false}
                            onChange={
                                (ev) => (ev.preventDefault() ||
                                    setPivotValue({index: fieldToIndex['Search'], target: ev.target.value}))
                            }
                        />
                    </div>
                </td>);
            } else {
                const inputNames = _.range(0, 10).map((i) => "Pivot " + i); //TODO use rowIndex
                console.log('INPUT NAMES', rowIndex, '->', inputNames);
                return (<td key={`${id}: ${fldIndex}`} className={styles['pivotData' + fldIndex]}>
                        <DropdownButton id={"pivotInputSelector" + id}
                            title={fields[fieldToIndex['Input']].value}
                            onSelect={
                                (mode, evt) => setPivotValue({index: fieldToIndex['Input'], target: mode})
                            } >
                            {inputNames.map((name, index) => (
                                <MenuItem eventKey={name} key={`${index}: ${id}`}>
                                    {name}
                                </MenuItem>)
                            )}
                            </DropdownButton>
                    </td>)
            }
        default:
            return (<td key={`${id}: ${fldIndex}`} className={styles['pivotData' + fldIndex]}></td>);
    }
};


function renderPivotRow({id, rowIndex, enabled, resultCount, length, fields, searchPivot, togglePivot, setPivotValue, splicePivot, insertPivot}) {
    console.log("my pivot row: ", rowIndex);
    return (
        <tr id={"pivotRow" + id}>
            <td className={styles.pivotToggle}>
                <RcSwitch defaultChecked={false}
                          checked={enabled}
                          checkedChildren={'On'}
                          onChange={(ev) => {
                              togglePivot({ rowIndex, enabled: ev })}
                          }
                          unCheckedChildren={'Off'}/>
            </td>
            { fields.map((field, fldIndex) => renderPivotCellByIndex(
                field, fldIndex,
                id, rowIndex, enabled, resultCount, length, fields, searchPivot, togglePivot, setPivotValue, splicePivot, insertPivot)) }
            <td className={styles.pivotResultCount}>
                    <Badge> {resultCount} </Badge>
            </td>
            <td className={styles.pivotIcons}>
                <ResultCount index={rowIndex} resultCount={resultCount} searchPivot={searchPivot}
                    insertPivot={insertPivot} splicePivot={splicePivot}/>
            </td>

        </tr>
    );
}

function mapStateToFragment({length = 0} = {}) {
    return `{
        'enabled', 'resultCount', 'id', 'length', [0...${length}]: {
            value
        }
    }`;
}

function mapFragmentToProps(fragment) {
    //const output =  { pivots: fragment, name: fragment.name, length: fragment.length};
    //console.log('output', output);
    const {id, length, resultCount, enabled} = fragment;
    return {id, length, fields:fragment, enabled, resultCount};
}

export default container(
        mapStateToFragment,
        mapFragmentToProps,
    {setPivotValue: setPivotValue,
    togglePivot: togglePivot}
)(renderPivotRow);

