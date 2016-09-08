import { container } from '@graphistry/falcor-react-redux';
import { Table } from 'react-bootstrap';
import PivotRow from './PivotRow';
//import PivotTable from './PivotTable';
import { table as tableClassName,
    tbody as tableBodyClassName,
    thead as tableHeaderClassName} from './styles.less';

import { splicePivot,
        insertPivot,
        searchPivot
} from '../actions/investigation'

function renderInvestigation({length = 0, name = 'default', pivots = [], searchPivot, insertPivot }) {
    const cellWidth = Math.round(88 / (4));
    return (
        <div>
            <div>
            Selected Investigation Name: { name }
            </div>
            <div>
            Number of pivots in investigation: { length }
            </div>
            <Table>
                { /* TODO reuse table row */ }
                <thead>
                    <tr>
                        <th style={{ width: `6%` }}> &nbsp; </th>
                        <th style={{ width: `${cellWidth}%` }}>Search</th>
                        <th style={{ width: `${cellWidth}%` }}>Extract nodes</th>
                        <th style={{ width: `${cellWidth}%` }}>Time</th>
                        <th style={{ width: `${cellWidth}%` }}>Result</th>
                    </tr>
                </thead>
                <tbody>
                {pivots.map((pivot, index) => (
                    <PivotRow data={pivot}
                              index={index}
                              key={`${index}: ${pivot.id}`}
                              searchPivot={searchPivot}
                              insertPivot={insertPivot}/>

                ))}
                </tbody>
            </Table>
        </div>
    );
}

function mapStateToFragment({selectedInvestigation = {}, length = 0, name = 'default', ...rest} = {}) {
    return `{
        'url', 'name', 'length', [0...${length}]: ${
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
        insertPivot: insertPivot,
        searchPivot: searchPivot
    }
)(renderInvestigation)

