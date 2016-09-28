import React from 'react';
import { ButtonGroup, Button, Glyphicon } from 'react-bootstrap';
import Investigation from './Investigation.js';
import InvestigationDropdown from './InvestigationDropdown.js';
import { DevTools } from './DevTools';
import { hoistStatics } from 'recompose';
import { connect, container } from '@graphistry/falcor-react-redux';
import {
    selectInvestigation,
    createInvestigation,
    setInvestigationName,
    saveInvestigation,
    copyInvestigation
} from '../actions/app';
import styles from './styles.less';

function GraphFrame({ url }) {
    return (
        <iframe allowFullScreen="true" src={url} scrolling="no" style={{
            width:'100%',
            height: '100%',
            border:'0px solid #DDD',
            boxSizing: 'border-box',
            overflow: 'hidden'
        }} />
    );
}

//note magic voodoo attribs on root element
function renderApp({ title, investigations, selectedInvestigation = {},
                     selectInvestigation, createInvestigation, setInvestigationName,
                     saveInvestigation, copyInvestigation }) {
    return (

<div className="wrapper">
    <div className="sidebar" data-color="blue" id="left-nav">

        <div className="sidebar-wrapper">
            <div className="logo">
                <div className="logo-wrapper">
                    <img src="/custom/img/logo.png"/>
                </div>
            </div>

            <ul className="nav">


                <li>
                    <a href="#">
                        <i className="pe-7s-user"></i>
                        <p>&nbsp;</p>
                    </a>
                </li>
                <li>
                    <a href="#">
                        <i className="pe-7s-users"></i>
                        <p>&nbsp;</p>
                    </a>
                </li>
                <li>
                    <a href="#">
                        <i className="pe-7s-note2"></i>
                        <p>&nbsp;</p>
                    </a>
                </li>
                <li className="active">
                    <a href="#">
                        <i className="pe-7s-graph1"></i>
                        <p>&nbsp;</p>
                    </a>
                </li>
                <li>
                    <a href="#">
                        <i className="pe-7s-network"></i>
                        <p>&nbsp;</p>
                    </a>
                </li>
                <li>
                    <a href="#">
                        <i className="pe-7s-plugin"></i>
                        <p>&nbsp;</p>
                    </a>
                </li>
                <li>
                    <a href="#" className="new-investigation">
                        <i className="pe-7s-plus"></i>
                        <p>&nbsp;</p>
                    </a>
                </li>

            </ul>
        </div>
    </div>


    <div className="main-panel" style={{width: 'calc(100% - 90px)', height: '100%'}}>

        <nav className="navbar navbar-default navbar-fixed" style={{height: '61px'}}>
            <div className="container-fluid">
                <div className="navbar-header">
                    <button type="button" className="navbar-toggle" data-toggle="collapse">
                        <span className="sr-only">Toggle navigation</span>
                        <span className="icon-bar"></span>
                        <span className="icon-bar"></span>
                        <span className="icon-bar"></span>
                    </button>

                    <span className="simple-text" style={{display: 'inline-block', float: 'left'}}>
                        <InvestigationDropdown data={investigations}
                           selectInvestigation={selectInvestigation}
                           selectedInvestigation={selectedInvestigation}/>
                    </span>
                    { /*
                    <a className="navbar-brand" href="#">Input</a>
                    <a className="navbar-brand on" href="#">Untitled_1</a>
                    */ }

                    <input key={selectedInvestigation.id + 'setInvestigationNameTextBox'}
                        className="navbar-brand on" type='text' value={selectedInvestigation.name}
                        readOnly={false} disabled={false} onChange={
                            (ev) => setInvestigationName(ev.target.value)
                        }
                    />

                    { /*
                    <a className="navbar-brand" href="#">Untitled2 (58)</a>
                    <a className="navbar-brand" href="#">Untitled3 (32)</a>
                    */ }
                </div>

               <div className="collapse navbar-collapse">
                   {/*<a href="#" className="navbar-brand" style={
                        {'fontSize': '1.7em',
                         'margin': 0,
                         'right': '1em',
                         'color': 'white',
                         'position': 'absolute',
                         'height': '60px',
                         'borderLeft': '1px solid #8095e0',
                         'paddingLeft': '1.5em'}
                    }>
                    <i className="pe-7s-plus"></i> */}
                    <span/>
                    <ButtonGroup>
                            <Button onClick={createInvestigation}>
                                <Glyphicon glyph="plus" />
                                </Button>
                            <Button onClick={(e) => copyInvestigation(selectedInvestigation.id)}>
                                <Glyphicon glyph="duplicate" />
                            </Button>
                            <Button onClick={(e) => saveInvestigation(selectedInvestigation.id)}>
                                <Glyphicon glyph="floppy-disk" />
                            </Button>
                        </ButtonGroup>
                    {/*</a>*/}
                </div>
            </div>
        </nav>


        <div className="content" id="graphistry-canvas-wrapper" style={{height: '-webkit-calc(100% - 60px - 200px)', width: '100%', overflow: 'hidden', minHeight: '0px'}}>
            <GraphFrame url={selectedInvestigation.url}/>
        </div>


        <footer className="footer" style={{height: '200px', overflow: 'auto'}}>
            <div className="container-fluid">
                {selectedInvestigation ?
                    <Investigation data={selectedInvestigation}/>
                    : null
                }
                <DevTools/>
            </div>
        </footer>

    </div>
</div>


    );
}



const App = container(
    ({ cols = [], investigations = [], selectedInvestigation } = {}) => `{
        title,
        investigations: ${
            InvestigationDropdown.fragment()
        },
        selectedInvestigation: ${Investigation.fragment(selectedInvestigation)}
    }`,
    (state) => state,
    {
        selectInvestigation: selectInvestigation,
        createInvestigation: createInvestigation,
        setInvestigationName: setInvestigationName,
        saveInvestigation: saveInvestigation,
        copyInvestigation: copyInvestigation
    }
)(renderApp);

export default hoistStatics(connect)(App);
