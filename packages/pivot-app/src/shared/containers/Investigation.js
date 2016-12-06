import _ from 'underscore';
import { container } from '@graphistry/falcor-react-redux';
import { Table, Alert, OverlayTrigger, Tooltip} from 'react-bootstrap';
import PivotRow from './PivotRow';
import {
    table as tableClassName,
    tbody as tableBodyClassName,
    thead as tableHeaderClassName
} from './styles.less';
import {
    BootstrapTable,
    TableHeaderColumn
} from 'react-bootstrap-table';
import {
    ButtonGroup,
    Button,
    Glyphicon,
    Tab,
    Tabs
} from 'react-bootstrap';
import styles from './styles.less';
import { splicePivot,
        insertPivot,
        searchPivot,
        playInvestigation,
        saveInvestigation,
        dismissAlert
} from '../actions/investigation';


function pivotTable({ id, pivots, templates, insertPivot, splicePivot, dismissAlert, searchPivot,
    playInvestigation, saveInvestigation }) {
    return (
        <Table>
            <thead>
                <tr>
                    <th className={styles.pivotToggle}>
                        <OverlayTrigger  placement="top" overlay={
                            <Tooltip id={`tooltip-play-all`}>Run all steps</Tooltip>
                        }>
                            <Button onClick={(ev) => playInvestigation({investigationId: id, length: pivots.length})}>
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
                    <PivotRow
                        investigationId={id}
                        data={pivot}
                        pivots={pivots}
                        templates={templates}
                        rowIndex={index}
                        key={`${index}: ${pivot.id}`}
                        searchPivot={searchPivot}
                        splicePivot={splicePivot}
                        insertPivot={insertPivot}/>

                ))}
            </tbody>
        </Table>
    );
}

function renderEventTable({fieldSummaries = {}, table = {}}) {
    function getFilterOpts(summary) {
        if(summary.numDistinct > 0 && summary.values !== undefined) {
            return {
                type: "SelectFilter",
                options: _.object(summary.values.map(x => [x,x]))
            };
        } else {
            return {
                type: "TextFilter"
            };
        }
    }

    if (_.isEmpty(fieldSummaries) || _.isEmpty(table)) {
        return (
            <Alert bsStyle="info">
                <h4>No data to show!</h4>
                <p>Please execute a pivot first.</p>
            </Alert>
        )
    }

    const fields = _.keys(fieldSummaries).sort();

    return (
        <BootstrapTable data={table}
                    striped={true}
                    condensed={true}
                    pagination={true}
                    bordered={true}
                    tableContainerClass={styles['investigation-data']}
                    options={{sizePerPage: 5, sizePerPageList: [ 5, 10, 20, 50, 100]}}>
            <TableHeaderColumn key="event-table-node" dataField="node" isKey={true} hidden={true}/>
            {
                _.difference(fields, ['node']).map(field =>
                    <TableHeaderColumn filter={getFilterOpts(fieldSummaries[field])}
                                        key={`event-table-${field}`}
                                        dataField={field}
                                        dataSort={true}>
                        { field }
                    </TableHeaderColumn>
                )
            }
        </BootstrapTable>
    );
}

function renderInvestigation({id, status, pivots = [], templates, eventTable,
                              searchPivot, insertPivot, splicePivot, dismissAlert,
                              playInvestigation, saveInvestigation }) {
    return (
        <div className={styles.pivots}>
            { status && !status.ok ?
                <Alert bsStyle={status.msgStyle || 'danger'} className={styles.alert} onDismiss={dismissAlert}>
                    <strong> {status.message} </strong>
                </Alert>
                : null
            }
            <Tabs defaultActiveKey={1} id="investigation-bottom-tabbar" className={styles.investigationTabs}>
                <Tab eventKey={1} title="Pivots">
                    {
                        pivotTable({
                            id, pivots, templates, insertPivot, splicePivot, dismissAlert,
                            searchPivot, playInvestigation, saveInvestigation
                        })
                    }
                </Tab>
                <Tab eventKey={2} title="Events">
                    {
                        eventTable && renderEventTable(eventTable)
                    }
                </Tab>
            </Tabs>
        </div>
    );
}

function mapStateToFragment({pivots = []} = {}) {
    return `{
        'status', 'id', 'name', 'url',
        'eventTable',
        pivots: {
            'length', [0...${pivots.length}]: ${
                PivotRow.fragment()
            }
        }
    }`;
}

function mapFragmentToProps(fragment) {
    return {
        id: fragment.id,
        pivots: fragment.pivots,
        status: fragment.status,
        eventTable: fragment.eventTable
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

