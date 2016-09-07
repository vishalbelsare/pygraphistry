import { container } from 'reaxtor-redux';
import PivotRow from './PivotRow';
//import PivotTable from './PivotTable';
import { table as tableClassName,
    tbody as tableBodyClassName,
    thead as tableHeaderClassName} from './styles.less';

import { splicePivot,
        addPivot,
        searchPivot
} from '../actions/investigation'

// TODO reuse table row
function renderTableHeader() {
    const cellWidth = Math.round(95 / (4));
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

function renderTable(pivots, searchPivot) {
    return (
        <table className={tableClassName} >
            { renderTableHeader() }
            <tbody className={tableBodyClassName}>
                { pivots.map((pivot, index) => (
                    (<PivotRow index={index} searchPivot={searchPivot} key={`${pivot.id}`} data={pivot} />)))
                }
            </tbody>
        </table>
    );
}

function renderInvestigation({length = 0, name = 'default', pivots = [], searchPivot }) {
    return (
            <div>
                <div>
                Selected Investigation Name: { name }
                </div>
                <div>
                Number of pivots in investigaiton: { length }
                </div>
                <div>
                { renderTable(pivots, searchPivot) }
                </div>
            </div>
        );
}

function mapStateToFragment({selectedInvestigation = {}, length = 0, name = 'default', ...rest} = {}) {
    return `{
                'name',
                'length',
                'url',
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
    mapFragmentToProps,
    {
        splicePivot: splicePivot,
        addPivot: addPivot,
        searchPivot: searchPivot
    }
)(renderInvestigation)

