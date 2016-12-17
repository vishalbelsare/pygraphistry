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
    Tabs,
    DropdownButton,
    MenuItem,
    Navbar,
    NavDropdown,
    Nav
} from 'react-bootstrap';
import styles from './styles.less';
import { splicePivot,
        insertPivot,
        searchPivot,
        graphInvestigation,
        saveInvestigation,
        dismissAlert
} from '../actions/investigation';


function pivotTable({ id, pivots, templates, insertPivot, splicePivot, dismissAlert, searchPivot,
    graphInvestigation, saveInvestigation }) {
    return (
        <Table>
            <thead>
                <tr>
                    <th className={styles.pivotToggle}>
                        <OverlayTrigger  placement="top" overlay={
                            <Tooltip id={`tooltip-play-all`}>Run all steps</Tooltip>
                        }>
                            <Button onClick={(ev) => graphInvestigation({investigationId: id, length: pivots.length})}>
                                <Glyphicon glyph="play" />
                            </Button>
                        </OverlayTrigger>
                    </th>
                </tr>
            </thead>
            <tbody>
                {/*<tr><span>"hello"</span></tr> this adds an element to the top of the pivot list*/}
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
                    options={{sizePerPage: 5, hideSizePerPage: true}}>
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
                              graphInvestigation, saveInvestigation }) {
    return (
        <div className={styles.pivots}>
            { status && !status.ok ?
                <Alert bsStyle={status.msgStyle || 'danger'} className={styles.alert} onDismiss={dismissAlert}>
                    <strong> {status.message} </strong>
                </Alert>
                : null
            }
                {/*<Navbar inverse>*/}
                {/*<span>
                    <nav
                    <DropdownButton bsSize="medium" title="My Investigation" id="dropdown-size-large">
                        <MenuItem eventKey="1">Botnet</MenuItem>
                    </DropdownButton>
                </span>*/}
                <div className={styles.testwrap}>
                  <Navbar fixedTop>
                    <Navbar.Header>
                      <Navbar.Brand>
                        <a href="#">Pivot App</a>
                      </Navbar.Brand>
                    </Navbar.Header>
                    <Nav>
                      <NavDropdown eventKey={3} title="My Investigation" id="basic-nav-dropdown">
                        <MenuItem eventKey={3.1}>Action</MenuItem>
                        <MenuItem eventKey={3.2}>Another action</MenuItem>
                        <MenuItem eventKey={3.3}>Something else here</MenuItem>
                        <MenuItem divider />
                        <MenuItem eventKey={3.3}>Separated link</MenuItem>
                      </NavDropdown>
                    </Nav>
                  </Navbar>
                </div>
            <Tabs defaultActiveKey={1} id="investigation-bottom-tabbar" className={styles.investigationTabs}>
                <Tab eventKey={1} title="Pivots">
                    {
                        pivotTable({
                            id, pivots, templates, insertPivot, splicePivot, dismissAlert,
                            searchPivot, graphInvestigation, saveInvestigation
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
        'status', 'id', 'name', 'url', 'tags', 'eventTable',
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
        graphInvestigation: graphInvestigation,
        saveInvestigation: saveInvestigation,
        searchPivot: searchPivot,
        dismissAlert: dismissAlert,
    }
)(renderInvestigation)
