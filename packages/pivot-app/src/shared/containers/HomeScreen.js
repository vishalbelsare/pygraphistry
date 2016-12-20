import React from 'react';
import { ReplaySubject } from 'rxjs';
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
    Image,
    Media,
    OverlayTrigger,
    Tooltip
} from 'react-bootstrap';
import { WithContext as ReactTags } from 'react-tag-input';
import { switchScreen } from '../actions/app';
import {
    selectInvestigation,
    copyInvestigation,
    createInvestigation,
    setInvestigationParams,
    deleteInvestigations
} from '../actions/investigationScreen.js';
import { container } from '@graphistry/falcor-react-redux';
import styles from './styles.less';
import logger from '../logger.js';
import MainNav from './MainNav/MainNav.js';
const log = logger.createLogger(__filename);


function welcomeBar(user, investigations, numTemplates) {
    return (
        <Grid><Row className={styles['welcome-bar']}>
            <Col md={4}>
                <Panel>
                    <Media.Left align="middle">
                        <Image width={84}
                            height={84}
                            src="/img/abstract-user-flat-3.svg"
                            className={styles['user-icon']}
                            circle/>
                    </Media.Left>
                    <Media.Body>
                        <Media.Heading className={styles['user-greeting-heading']}>
                            Greetings!
                        </Media.Heading>
                        <span className={styles['user-greeting-message']}>
                            Welcome, {user.name}!
                        </span>
                    </Media.Body>
                </Panel>
             </Col>
            <Col md={4}>
                <Panel>
                    <h2 className="text-center">{investigations.length}</h2>
                    <div className="text-center">
                        Ongoing Investigations
                    </div>
                </Panel>
            </Col>
            <Col md={4}>
                <Panel>
                    <h2 className="text-center">
                        { numTemplates }
                    </h2>
                    <div className="text-center">
                        Templates
                    </div>
                </Panel>
            </Col>
        </Row></Grid>
    );
}


class TagCell extends React.Component {
    constructor(props, context) {
        super(props, context);

        this.handleAddition = this.handleAddition.bind(this);
        this.handleDelete = this.handleDelete.bind(this);
        this.handleDrag = this.handleDrag.bind(this);
        this.updateServerState = this.updateServerState.bind(this);

        this.state = {tags: props.tags};
        this.serverUpdates$ = new ReplaySubject(1);
        this.serverUpdates$
            .debounceTime(1000)
            .subscribe(
                tags => this.updateServerState(tags),
                err => log.error(err, 'TagCell server update stream error')
            );
    }

    handleDelete(i) {
        let { tags } = this.state;
        tags.splice(i, 1);

        this.setState({tags: tags});
        this.serverUpdates$.next(tags);
    }

    handleAddition(tag) {
        let { tags } = this.state;

        tags.push({
            id: tags.length + 1,
            text: tag
        });

        this.setState({tags: tags});
        this.serverUpdates$.next(tags);
    }

    handleDrag(tag, currPos, newPos) {
        let tags = this.state.tags;

        tags.splice(currPos, 1);
        tags.splice(newPos, 0, tag);

        this.setState({tags: tags});
        this.serverUpdates$.next(tags);
    }

    updateServerState(tags) {
        const { setInvestigationParams, investigationId } = this.props;
        setInvestigationParams({tags: _.pluck(tags, 'text')}, investigationId);
    }

    render() {
        let tags = this.state.tags;
        return (
            <div>
                <ReactTags tags={tags}
                           handleDelete={this.handleDelete}
                           handleAddition={this.handleAddition}
                           handleDrag={this.handleDrag}
                           autofocus={false}
                />
            </div>
        )
    }
}


function investigationTable({investigations = [], switchScreen, selectInvestigation, copyInvestigation,
                             setInvestigationParams, selectHandler}) {
    function tagsFormatter(tags = [], row) {
        const tagsArray = tags.map((tag, i) => ({id: i, text: tag}));

        return (
            <div>
            <TagCell
                tags={tagsArray}
                investigationId={row.id}
                setInvestigationParams={setInvestigationParams} />
            </div>
        );
    }

    function nameFormatter(name, row) {
        return (<a href="#"
                    onClick={
                        () => {selectInvestigation(row.id); switchScreen('investigation')} }>
                    { name }
                </a>)
    }

    function idFormatter(id) {
        return (
            <div>
                <Button onClick={() => copyInvestigation(id)}>
                    Copy
                </Button>
            </div>
        );
    }

    function dateFormatter(epoch) {
        return (new Date(epoch)).toLocaleString()
    }

    function onAfterSaveCell(row, column) {
        if (['name', 'description'].includes(column)) {
            setInvestigationParams({[column]: row[column]}, row.id);
        } else {
            log.error('Cannot edit column' + column);
        }
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
    const cellEditProp = {
        mode: 'click',
        blurToSave: true,
        afterSaveCell: onAfterSaveCell
    };

    return (
        <div className={styles['investigation-table']}>
            <BootstrapTable data={investigations.filter(Boolean)}
                            selectRow={selectRowProp}
                            cellEdit={cellEditProp}
                            striped={false}
                            hover={true}
                            pagination={true}
                            options={{defaultSortName: 'modifiedOn', defaultSortOrder: 'desc'}}>
                <TableHeaderColumn dataField="id" isKey={true} hidden={true} editable={false}/>
                <TableHeaderColumn dataField="name" dataSort={true} width="200px" dataFormat={nameFormatter}>
                    Name
                </TableHeaderColumn>
                <TableHeaderColumn dataField="description">
                    Description
                </TableHeaderColumn>
                <TableHeaderColumn dataField="modifiedOn" dataSort={true} editable={false}
                                   dataFormat={dateFormatter} width="180px" dataAlign="center">
                    Last Modified
                </TableHeaderColumn>

                <TableHeaderColumn dataField="tags" dataFormat={tagsFormatter} width="200px" editable={false}>
                    Tags
                </TableHeaderColumn>

                <TableHeaderColumn dataField="id" dataFormat={idFormatter} width='172px' editable={false}>
                    Actions
                </TableHeaderColumn>
            </BootstrapTable>
        </div>
   );

}


function renderHomeScreen(
    {
        user, investigations, numTemplates, switchScreen, selectInvestigation,
        copyInvestigation, createInvestigation, setInvestigationParams
    },
    {selection},
    selectHandler,
    deleteHandler
) {
    if (user === undefined) {
        return null;
    }

    return (
        <MainNav activeScreen={'home'}>{
                <Panel className={styles['main-panel-panel']}>
                    {
                        welcomeBar(user, investigations, numTemplates)
                    }
                    <Panel header="Open Investigations" className={styles['panel']}>
                        <div className={styles['investigations-buttons']}>
                            <OverlayTrigger placement="top"
                                            overlay={
                                                <Tooltip id="AddNewInvestigationTooltip">
                                                    Add New Investigation
                                                </Tooltip>
                                            }>
                                <Button onClick={() => createInvestigation(user.id) }
                                        className={`btn-primary ${styles['add-new-investigation']}`}>
                                    <Glyphicon glyph="plus"/>
                                </Button>
                            </OverlayTrigger>
                            <OverlayTrigger placement="top"
                                            overlay={
                                                <Tooltip id="DeleteInvestigationsTooltip">
                                                    Delete Selected Investigations
                                                </Tooltip>
                                            }>
                                <Button onClick={() => deleteHandler()}
                                        className={`btn-danger ${styles['delete-investigations']}`}>
                                    <Glyphicon glyph="trash"/>
                                </Button>
                            </OverlayTrigger>
                        </div>
                        {
                            investigationTable({
                                user, investigations, switchScreen, selectInvestigation,
                                copyInvestigation, setInvestigationParams, selectHandler
                            })
                        }
                    </Panel>
                </Panel>
        }</MainNav>
    );
}

class HomeScreen extends React.Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            selection: []
        }
    }

    render() {
        return renderHomeScreen(
            this.props,
            this.state,
            this.selectHandler.bind(this),
            this.deleteHandler.bind(this)
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

    deleteHandler() {
        this.props.deleteInvestigations(this.props.user.id, this.state.selection);
        this.setState({
            selection: []
        });
    }
}

function mapStateToFragment({currentUser: {investigations = []} = {} }) {
    return `{
        currentUser: {
            'name', 'id',
            investigations: {
                'length',
                [0...${investigations.length}]: {
                    'id', 'name', 'description' ,'tags', 'modifiedOn'
                }
            },
            templates: {
                'length'
            }
        }
    }`
}

function mapFragmentToProps({ currentUser } = {}) {
    const {investigations = [], templates: {length = 0} = {}} = currentUser;

    return {
        user: currentUser,
        investigations: investigations,
        numTemplates: length
    };
}

export default container({
    renderLoading: false,
    fragment: mapStateToFragment,
    mapFragment: mapFragmentToProps,
    dispatchers: {
        switchScreen: switchScreen,
        selectInvestigation: selectInvestigation,
        copyInvestigation: copyInvestigation,
        createInvestigation: createInvestigation,
        setInvestigationParams: setInvestigationParams,
        deleteInvestigations: deleteInvestigations
    }
})(HomeScreen);
