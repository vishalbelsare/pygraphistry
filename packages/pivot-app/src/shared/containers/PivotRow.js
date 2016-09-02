import { container } from 'reaxtor-redux';
import { tcell as tableCellClassName } from './styles.less';

function renderResultCount(resultCount) {
    return (
        <div className={{ [tableCellClassName]: true }}>
            <span> {resultCount} </span>
        </div>
    );
}

function renderCheckBox(checked) {
    return (
            <td style={{ width: `2%` }}>
                <input
                    type="checkbox"
                    checked='true'/>
            </td>
    )
}

function renderPivotRow({id, length, fields}) {
    const cellWidth = Math.round(95 / (length + 1));
    return (
            <tr>
                {renderCheckBox(true)}
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
                    {renderResultCount(0)}
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

