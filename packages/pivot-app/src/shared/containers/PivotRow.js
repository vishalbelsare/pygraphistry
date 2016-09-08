import { container } from '@graphistry/falcor-react-redux';
import { tcell as tableCellClassName,
         splice as spliceIconClassName,
         insert as insertIconClassName,
         search as searchIconClassName } from './styles.less';
import { setPivotValue, togglePivot } from '../actions/PivotRow';
import { HelpBlock, Button, Glyphicon, ButtonGroup, Badge, FormGroup, FormControl, ControlLabel } from 'react-bootstrap'
import RcSwitch from 'rc-switch';

function ResultCount({ index, resultCount, splicePivot, searchPivot, insertPivot }) {
    return (
        <div>
        <Badge> {resultCount} </Badge>
        </div>
    );
    //return (
        //<div>
        //<ButtonGroup style={{float:'right'}} >
            //<Button onClick={(ev) => insertPivot({index})}><Glyphicon glyph="plus" /></Button>
            //<Button onClick={(ev) => splicePivot({index})}><Glyphicon glyph="minus" /></Button>
            //<Button onClick={(ev) => searchPivot({index})}><Glyphicon glyph="search" /></Button>
        //</ButtonGroup>
        //<Badge> {resultCount} </Badge>
        //</div>
    //);
}

function renderPivotRow({id, index, enabled, resultCount, length, fields, searchPivot, togglePivot, setPivotValue, splicePivot, insertPivot}) {
    const cellWidth = Math.round(88 / (length + 1));
    return (
        <tr>
            <td style={{ width: `8%` }}>
                <RcSwitch defaultChecked={false}
                          checked={enabled}
                          checkedChildren={'On'}
                          onChange={(ev) => {
                              togglePivot({ index, enabled: ev })}
                          }
                  unCheckedChildren={'Off'}/>
                  <ButtonGroup bsSize='xsmall' style={{float:'right'}} >
                      <Button onClick={(ev) => insertPivot({index})}><Glyphicon glyph="plus" /></Button>
                          <Button onClick={(ev) => splicePivot({index})}><Glyphicon glyph="minus" /></Button>
                          <Button onClick={(ev) => searchPivot({index})}><Glyphicon glyph="search" /></Button>
                  </ButtonGroup>
            </td>
        {fields.map((field, index) =>
            <td key={`${id}: ${index}`}
                style={{ width: `${cellWidth}%`}}>
                <div className={tableCellClassName}>
                <form>
                    <FormControl
                        bsSize="small"
                        style={{ overflow:'scroll' }}
                        type="text"
                        defaultValue={field.value}
                        placeholder="Enter text"
                        onChange={(ev) => {
                            console.log('Ev', ev.target.value)
                            setPivotValue({index, target:ev.target.value})}
                        }
                    />
                    <FormControl.Feedback />
                </form>
                </div>
            </td>
            )
        }
            <td style={{ width: `${cellWidth}%`}}>
                <ResultCount index={index} resultCount={resultCount} searchPivot={searchPivot}
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

