import {
    BootstrapTable,
    TableHeaderColumn
} from 'react-bootstrap-table';
import {
    ButtonGroup,
    Button,
    Glyphicon,
    Panel,
    Grid,
    Row,
    Col,
    Image,
    Media,
    Label
} from 'react-bootstrap';
import { switchScreen } from '../actions/app';
import {
    selectInvestigation,
    copyInvestigation,
    createInvestigation,
    setInvestigationParams,
} from '../actions/investigationScreen.js';
import { container } from '@graphistry/falcor-react-redux';
import Sidebar from './Sidebar.js';


function welcomeBar(user, investigations) {
    return (
        <Grid><Row>
            <Col md={4}>
                <Panel>
                    <Media.Left align="middle">
                        <Image width={84}
                            height={84}
                            src="http://www.fondosgratis.mx/archivos/temp/6282/400_1234535297_bapeabathingapespongebobbylastemp.jpg"
                            circle/>
                    </Media.Left>
                    <Media.Body>
                        <Media.Heading>{user.name}</Media.Heading>
                        <a href='#'>Edit profile</a>
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
                    <h2 className="text-center">42</h2>
                    <div className="text-center">
                        Templates
                    </div>
                </Panel>
            </Col>
        </Row></Grid>
    );
}

function investigationTable({user, investigations, switchScreen, selectInvestigation, copyInvestigation,
                             setInvestigationParams}) {
    function tagsFormatter(tags, row) {
        return (
            <p> {
                tags.map(tag => (
                    <Label key={`ilisttags-${row.id}-${tag}`}> { tag } </Label>
                ))
            } </p>
        );
    }

    function idFormatter(id, row) {
        return (
            <div>
                <Button bsStyle="primary" onClick={
                    () => {selectInvestigation(id); switchScreen('investigation')}
                }>
                    <Glyphicon glyph="eye-open"/> Open
                </Button>
                &nbsp;
                <Button onClick={() => copyInvestigation(id)}>
                    <Glyphicon glyph="duplicate"/> Copy
                </Button>
            </div>
        );
    }

    function dateFormatter(epoch, row) {
        return (new Date(epoch)).toLocaleString()
    }

    function onAfterSaveCell(row, column) {
        if (['name', 'description'].includes(column)) {
            setInvestigationParams({[column]: row[column]}, row.id);
        } else {
            console.error('Cannot edit', column);
        }
    }

    const selectRowProp = {
        mode: 'checkbox',
        clickToSelect: false,
    };
    const cellEditProp = {
        mode: 'dbclick',
        blurToSave: true,
        afterSaveCell: onAfterSaveCell
    };

    return (
        <BootstrapTable data={investigations}
                        selectRow={selectRowProp}
                        cellEdit={cellEditProp}
                        striped={false}
                        hover={false}
                        options={{defaultSortName: 'modifiedOn', defaultSortOrder: 'desc'}}>
            <TableHeaderColumn dataField="id" isKey={true} hidden={true} editable={false}/>
            <TableHeaderColumn dataField="name" dataSort={true} width="200px">
                Name
            </TableHeaderColumn>
            <TableHeaderColumn dataField="description">
                Description
            </TableHeaderColumn>
            <TableHeaderColumn dataField="modifiedOn" dataSort={true} editable={false}
                               dataFormat={dateFormatter} width="180px" dataAlign="center">
                Last Modified
            </TableHeaderColumn>
            {/*
            <TableHeaderColumn dataField="tags" dataFormat={tagsFormatter} editable={false}>
                Tags
            </TableHeaderColumn>
            */}
            <TableHeaderColumn dataField="id" dataFormat={idFormatter} width='172px' editable={false}>
                Actions
            </TableHeaderColumn>
        </BootstrapTable>
   );

}

function renderHomeScreen({user, investigations, switchScreen, selectInvestigation, copyInvestigation,
                           createInvestigation, setInvestigationParams}) {
    if (user === undefined) {
        return null;
    }

    return (
        <div className="wrapper">
            <Sidebar activeScreen='home'/>
            <div className="main-panel" style={{width: 'calc(100% - 90px)', height: '100%'}}>
                <Panel>
                    {
                        welcomeBar(user, investigations)
                    }
                    <Panel header="Ongoing Investigations">
                        <span style={{marginLeft: '10px'}}/>
                        <ButtonGroup>
                            <Button onClick={() => createInvestigation()}>
                                <Glyphicon glyph="plus"/>
                            </Button>
                            <Button onClick={(e) => alert('not implemented')}>
                                <Glyphicon glyph="trash"/>
                            </Button>
                        </ButtonGroup>
                        {
                            investigationTable({
                                user, investigations, switchScreen, selectInvestigation,
                                copyInvestigation, setInvestigationParams
                            })
                        }
                    </Panel>
                </Panel>
            </div>
        </div>
    );
}

function mapStateToFragment({currentUser = {investigations: []}}) {
    return `{
        currentUser: {
            'name',
            investigations: {
                'length',
                [0...${(currentUser.investigations).length}]: {
                    'id', 'name', 'description' ,'tags', 'modifiedOn'
                }
            }
        }
    }`
}

function mapFragmentToProps({currentUser} = {}) {
    return {
        user: currentUser,
        investigations: (currentUser || {}).investigations || []
    };
}

export default container(
    mapStateToFragment,
    mapFragmentToProps,
    {
        switchScreen: switchScreen,
        selectInvestigation: selectInvestigation,
        copyInvestigation: copyInvestigation,
        createInvestigation: createInvestigation,
        setInvestigationParams: setInvestigationParams
    }
)(renderHomeScreen);
