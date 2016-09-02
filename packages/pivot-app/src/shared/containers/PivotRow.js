import { container } from 'reaxtor-redux';
import { tcell as tableCellClassName } from './styles.less'

function renderPivotRow({id, length, fields}) {
    console.log("Length", length)
    const cellWidth = Math.round(95 / (length + 1));
    const resultCountVdom = (
        <div className={{ [tableCellClassName]: true }}>
            <span> {0} </span>
        </div>
    )
    return (
            <tr>
                <td style={{ width: `2%` }}>
                    <input 
                        type="checkbox" 
                        checked='true'/>
                </td>
            {
                fields.map((field, index) =>
                <td key={`${id}: ${index}`}
                    style={{ width: `${cellWidth}%`}}>
                    <div className={tableCellClassName}>
                        <input
                            type='th'
                            value={field.value}
                            readOnly={true}
                            disabled={false}
                        />
                    </div>
                </td>
                )
            }
                <td style={{ width: `${cellWidth}%`}}>
                    {resultCountVdom}
                </td>
            </tr>
        );
}

function mapStateToFragment({length = 0} = {}) {
    return `{
                'id',
                'length',
                [0...${length}]: {
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
        mapFragmentToProps
)(renderPivotRow);

