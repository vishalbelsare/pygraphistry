import { container } from '@graphistry/falcor-react-redux';
import { Table } from 'react-bootstrap';
import PivotRow from './PivotRow';
//import PivotTable from './PivotTable';
import { table as tableClassName,
    tbody as tableBodyClassName,
    thead as tableHeaderClassName} from './styles.less';

import styles from './styles.less';

import { splicePivot,
        insertPivot,
        searchPivot
} from '../actions/investigation'

function renderInvestigation({length = 0, templates = 'all', name = 'default', pivots = [], searchPivot, insertPivot, splicePivot }) {
    const cellWidth = Math.round(88 / (4));
    return (
        <div className={styles.pivots}>
            <Table>
                <thead>
                    <tr>
                        <td className={styles.pivotToggle}></td>
                        <td className={styles.pivotData0 + ' pivotTypeSelector'}>Step</td>
                        <td colSpan="4" className={styles.pivotData1}>Parameters</td>
                        <td colSpan="2" className={styles.pivotResultCount}>Hits</td>
                    </tr>
                </thead>
                <tbody>
                {pivots.map((pivot, index) => (
                    <PivotRow data={pivot}
                              rowIndex={index}
                              key={`${index}: ${pivot.id}`}
                              searchPivot={searchPivot}
                              splicePivot={splicePivot}
                              insertPivot={insertPivot}/>

                ))}
                </tbody>
            </Table>
        </div>
    );
}

function mapStateToFragment({selectedInvestigation = {}, name = 'default', pivots = []} = {}) {
    return `{
        'url', 'name',
        pivots: {
            'length', [0...${pivots.length}]: ${
                PivotRow.fragment()
            }
        }
    }`;
}

function mapFragmentToProps(fragment) {
    return {
        pivots: fragment.pivots,
        name: fragment.name,
        length: fragment.pivots.length
    };
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

