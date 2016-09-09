import { container } from '@graphistry/falcor-react-redux';
import { tcell as tableCellClassName,
         splice as spliceIconClassName,
         insert as insertIconClassName,
         search as searchIconClassName } from './styles.less';
import { setPivotValue, togglePivot } from '../actions/PivotRow';
import { Button, Glyphicon, ButtonGroup, Badge, DropdownButton, MenuItem } from 'react-bootstrap'
import RcSwitch from 'rc-switch';
import styles from './styles.less';

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
        <Badge> {resultCount} </Badge>
        </div>
    );
}



function renderPivotCellByIndex (
    field, fldIndex,
    id, rowIndex, enabled, resultCount, length, fields, searchPivot, togglePivot, setPivotValue, splicePivot, insertPivot) {

    switch (fldIndex) {
        case 0:
            return <td key={`${id}: ${fldIndex}`} className="pivotTypeSelector">Searcher</td>;

            const pivotNames = ['Search','pivot 1', 'pivot 2'];
            console.log("pivot", rowIndex, id, "pivot mode:", field.value);
            if (pivotNames.indexOf(field.value) > -1) {

                return (<td key={`${id}: ${fldIndex}`} className="pivotTypeSelector">
                        <DropdownButton id={"pivotTypeSelector" + id} title={field.value}>
                        {pivotNames.map((name, index) => (
                            <MenuItem eventKey={id} key={`${index}: ${id}`}>
                                {name}
                            </MenuItem>
                        ))}
                        </DropdownButton>
                    </td>);

            } else {
                //fallthrough
            }
        case 1:
            return (<td key={`${id}: ${fldIndex}`} className={styles['pivotData' + fldIndex]}>
                <div className={tableCellClassName}>
                    <input
                        type='th'
                        defaultValue={field.value}
                        readOnly={false}
                        disabled={false}
                        onChange={
                            (ev) => (ev.preventDefault() ||
                                setPivotValue({fldIndex, target: ev.target.value}))
                        }
                    />
                </div>
            </td>);
        default:
            return (<td key={`${id}: ${fldIndex}`} style={ {display: 'none'} }></td>);
    }
};


function renderPivotRow({id, rowIndex, enabled, resultCount, length, fields, searchPivot, togglePivot, setPivotValue, splicePivot, insertPivot}) {
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

