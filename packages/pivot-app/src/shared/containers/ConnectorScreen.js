import React from 'react';
import _ from 'underscore';
import {
    BootstrapTable,
    TableHeaderColumn
} from 'react-bootstrap-table';
import {
    Button,
    Glyphicon,
    Panel,
    Grid,
    Row,
    Col,
    Media,
    OverlayTrigger,
    Tooltip
} from 'react-bootstrap';
import { switchScreen } from '../actions/app';
import {
    checkStatus
} from '../actions/connectorScreen.js';
import { container } from '@graphistry/falcor-react-redux';
import MainNav from './MainNav/MainNav.js';
import styles from './styles.less';
import logger from '../logger.js';
const log = logger.createLogger(__filename);


function welcomeBar(user, connectors) {
    return (
        <Grid><Row className={styles['welcome-bar']}>
            <Col md={6}>
                <Panel>
                    <Media.Body>
                        <Media.Heading className={styles['user-greeting-heading']}>
                            Connectors!
                        </Media.Heading>
                        <span>
                            Manage your data connections
                        </span>
                    </Media.Body>
                </Panel>
             </Col>
            <Col md={6}>
                <Panel>
                    <h2 className="text-center">{connectors.length}</h2>
                    <div className="text-center">
                         Number of Connectors
                    </div>
                </Panel>
            </Col>
        </Row></Grid>
    );
}

function connectorTable({connectors = [], selectHandler, checkStatus}) {

    function nameFormatter(name) {
        return (<a href="#">
                    { name }
                </a>);
    }

    function descriptionFormatter(description, row) {
        return (<a href="#">
                    { row.status.message }
                </a>);
    }

    function idFormatter(id, row) {
        return (
            <div>
                <Button bsStyle={row.status.level} onClick={() => checkStatus(id)}>
                    Status
                </Button>
            </div>
        );
    }

    function dateFormatter(epoch) {
        return (new Date(epoch)).toLocaleString()
    }

    function selectAllHandler(selected, rows) {
        selectHandler(rows, selected);
    }

    const selectRowProp = {
        mode: 'checkbox',
        clickToSelect: false,
        onSelect: selectHandler,
        onSelectAll: selectAllHandler,
        bgColor: '#fee'
    };

    return (
        <div className={styles['investigation-table']}>
            <BootstrapTable data={connectors.filter(Boolean)}
                            selectRow={selectRowProp}
                            striped={false}
                            hover={true}
                            pagination={true}
                            options={{defaultSortName: 'name', defaultSortOrder: 'desc'}}>
                <TableHeaderColumn dataField="id" isKey={true} hidden={true} editable={false}/>
                <TableHeaderColumn dataField="name" dataSort={true} width="200px" dataFormat={nameFormatter}>
                    Name
                </TableHeaderColumn>
                <TableHeaderColumn dataField="message" dataFormat={descriptionFormatter}>
                    Message
                </TableHeaderColumn>
                <TableHeaderColumn dataField="lastUpdated" dataSort={true} editable={false}
                                   dataFormat={dateFormatter} width="180px" dataAlign="center">
                    Updated
                </TableHeaderColumn>
                <TableHeaderColumn dataField="id" dataFormat={idFormatter} width='172px' editable={false}>
                    Actions
                </TableHeaderColumn>
            </BootstrapTable>
        </div>
   );

}

function renderConnectorScreen({ user, connectors, switchScreen, checkStatus }) {
    if (user === undefined) {
        return null;
    }

    return (
        <MainNav activeScreen='connectors'>
                <Panel className={styles['main-panel-panel']}>
                    {
                        welcomeBar(user, connectors)
                    }
                    <Panel header="Available Connectors" className={styles['panel']}>
                        <div className={styles['investigations-buttons']}>
                            <OverlayTrigger placement="top"
                                            overlay={
                                                <Tooltip id="AddNewConnectorTooltip">
                                                    Add New Connector
                                                </Tooltip>
                                            }>
                                <Button onClick={() => alert('Todo')}
                                        className={`btn-primary ${styles['add-new-investigation']}`}>
                                    <Glyphicon glyph="plus"/>
                                </Button>
                            </OverlayTrigger>
                        </div>
                        {
                            connectorTable({
                                user, connectors, switchScreen, checkStatus
                            })
                        }
                    </Panel>
                </Panel>
        </MainNav>
    );
}

class ConnectorScreen extends React.Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            selection: []
        }
    }

    render() {
        return renderConnectorScreen(
            this.props,
            this.state,
            this.selectHandler.bind(this)
        );
    }

    selectHandler(row, selected) {
        const ids = Array.isArray(row) ? row.map(x => x.id) : [row.id];
        const selection = this.state.selection;
        const newSelection = selected ? selection.concat(ids)
                                      : _.reject(selection, (x) => ids.includes(x))
        this.setState({
            selection: newSelection
        });
    }
}

function mapStateToFragment({currentUser: { connectors = [] } = {} }) {
    return `{
        currentUser: {
            'name', 'id',
            connectors: {
                'length',
                [0...${connectors.length}]: {
                    'id',
                    'name',
                    'lastUpdated',
                    'status'
                }
            }
        }
    }`
}

function mapFragmentToProps({ currentUser } = {}) {
    return {
        user: currentUser,
        connectors: (currentUser || {}).connectors || []
    };
}

export default container({
    renderLoading: false,
    fragment: mapStateToFragment,
    mapFragment: mapFragmentToProps,
    dispatchers: {
        switchScreen: switchScreen,
        checkStatus: checkStatus
    }
})(ConnectorScreen);
