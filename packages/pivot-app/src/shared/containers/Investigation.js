import { container } from 'reaxtor-redux';
import PivotRow from './PivotRow';
//import PivotTable from './PivotTable';
import { table as tableClassName,
    tbody as tableBodyClassName,
    thead as tableHeaderClassName} from './styles.less';

// TODO reuse table row
function renderTableHeader(length) {
    const cellWidth = Math.round(95 / (4));
    console.log('Cell width', cellWidth)
    return (
        <thead className={tableHeaderClassName}>
            <tr >
                <th style={{ width: `2%` }}> &nbsp; </th>
                <th style={{ width: `${cellWidth}%` }} > Search </th>
                <th style={{ width: `${cellWidth}%` }} > Extract nodes </th>
                <th style={{ width: `${cellWidth}%` }} > Time </th>
                <th style={{ width: `${cellWidth}%` }} > Result </th>
            </tr>
        </thead>
    );
}


function renderInvestigation({length = 0, name = 'default', pivots = []}) {
    return (
            <div>
                <div>
                    Selected Investigation Name: { name }
                </div>
                <div>
                Number of pivots in investigaiton: { length }
                </div>
                <table className={tableClassName}
                       style={{ border: 0, cellpadding: 0, cellspacing: 0 }}>
               {
                   renderTableHeader(length)
               }
                    <tbody className={tableBodyClassName}>
                {
                    pivots.map((pivot) => (
                        (<PivotRow key={`${pivot.id}`} data={pivot} />)
                    ))
                }
                    </tbody>
                </table>
            </div>
        );
}

function mapStateToFragment({selectedInvestigation = {}, length = 0, name = 'default', ...rest} = {}) {
    return `{
                'name',
                'length',
                [0...${length}]: ${
                    PivotRow.fragment()
                }
            }`;
}

function mapFragmentToProps(fragment) {
    const output =  { pivots: fragment, name: fragment.name, length: fragment.length};
    return output;
}

export default container(
        mapStateToFragment,
        mapFragmentToProps
)(renderInvestigation)

