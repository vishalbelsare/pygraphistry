import { container } from '@graphistry/falcor-react-redux';
import { tcell as tableCellClassName,
         splice as spliceIconClassName,
         insert as insertIconClassName,
         search as searchIconClassName } from './styles.less';
import { setPivotValue } from '../actions/PivotRow';
import RcSwitch from 'rc-switch';

function renderResultCount({index, resultCount, searchPivot}) {
    return (
        <div className={ tableCellClassName }>
            <span> {resultCount} </span>
            <i className={ spliceIconClassName }/>
            <i className={ insertIconClassName }/>
            <i className={ searchIconClassName }
                onClick={ (ev) => {
                        searchPivot({index: index});
                    }
                }/>
        </div>
    );
}

function renderCheckBox(checked) {
    return (
            <td style={{ width: `2%` }}>
                <input
                    type="checkbox"
                    defaultChecked={checked}/>
            </td>
    )
}

function PivotSelectedCell({ checked, onChange }) {
    return (
        <td style={{ width: `2%` }}>
            <input
                type="checkbox"
                onChange={onChange}
                defaultChecked={checked}/>
        </td>
    )
}


function renderPivotRow({id, index, length, fields, searchPivot, setPivotValue}) {
    const cellWidth = Math.round(88 / (length + 1));
    return (
        <tr>
            <td style={{ width: `6%` }}>
                <RcSwitch defaultChecked={true}
                          checkedChildren={'On'}
                          unCheckedChildren={'Off'}/>
            </td>
        {fields.map((field, index) =>
            <td key={`${id}: ${index}`}
                style={{ width: `${cellWidth}%`}}>
                <div className={tableCellClassName}>
                    <input
                        type='th'
                        defaultValue={field.value}
                        readOnly={false}
                        disabled={false}
                        onChange={
                            (ev) => (ev.preventDefault() ||
                                setPivotValue({index, target: ev.target.value}))
                        }
                    />
                </div>
            </td>
            )
        }
            <td style={{ width: `${cellWidth}%`}}>
                {renderResultCount({index, resultCount:0, searchPivot})}
            </td>
        </tr>
    );
}

function mapStateToFragment({length = 0} = {}) {
    return `{
        'id', 'length', [0...${length}]: {
            value
        }
    }`;
}

function mapFragmentToProps(fragment) {
    //const output =  { pivots: fragment, name: fragment.name, length: fragment.length};
    //console.log('output', output);
    const {id, length } = fragment;
    return {id, length, fields:fragment};
}

export default container(
        mapStateToFragment,
        mapFragmentToProps,
        {setPivotValue: setPivotValue}
)(renderPivotRow);

