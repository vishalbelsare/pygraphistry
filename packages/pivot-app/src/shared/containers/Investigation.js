import { container } from '@graphistry/falcor-react-redux';
import { Table, Alert, OverlayTrigger, Tooltip} from 'react-bootstrap';
import PivotRow from './PivotRow';
import { table as tableClassName,
    tbody as tableBodyClassName,
    thead as tableHeaderClassName} from './styles.less';
import { ButtonGroup, Button, Glyphicon } from 'react-bootstrap'
import styles from './styles.less';
import { splicePivot,
        insertPivot,
        searchPivot,
        playInvestigation,
        saveInvestigation,
        dismissAlert
} from '../actions/investigation'


function renderInvestigation({status, pivots = [],
                              searchPivot, insertPivot, splicePivot, dismissAlert,
                              playInvestigation, saveInvestigation }) {
    const cellWidth = Math.round(88 / (4));
    return (
        <div className={styles.pivots}>
            { !status.ok ?
            <Alert bsStyle={'danger'} className={styles.alert} onDismiss={dismissAlert}>
                <strong> {status.message} </strong>
            </Alert>
            : null
            }
            <Table>
                <thead>
                    <tr>
                        <th className={styles.pivotToggle}>

                            <OverlayTrigger  placement="top" overlay={
                                <Tooltip id={`tooltip-play-all`}>Run all steps</Tooltip>
                            }>
                                <Button onClick={(ev) => playInvestigation({length: pivots.length})}>
                                    <Glyphicon glyph="play" />
                                </Button>
                            </OverlayTrigger>
                        </th>
                        <th className={styles.pivotData0 + ' pivotTypeSelector'}>Step</th>
                        <th className={styles.pivotData1}>Parameters</th>
                        <th colSpan="2" className={styles.pivotResultCount}>Hits</th>
                        <th className={styles.pivotResultCount}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {pivots.map((pivot, index) => (
                        <PivotRow data={pivot}
                                  pivots={pivots}
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

function mapStateToFragment({selectedInvestigation = {}, pivots = []} = {}) {
    return `{
        'url', 'name', 'status', 'id',
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
        status: fragment.status,
    };
}

export default container(
    mapStateToFragment,
    mapFragmentToProps,
    {
        splicePivot: splicePivot,
        insertPivot: insertPivot,
        searchPivot: searchPivot,
        playInvestigation: playInvestigation,
        saveInvestigation: saveInvestigation,
        searchPivot: searchPivot,
        dismissAlert: dismissAlert,
    }
)(renderInvestigation)

