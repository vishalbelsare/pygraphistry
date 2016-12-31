import React from 'react';
import _ from 'underscore';
import Investigation from './Investigation.js';
import InvestigationHeader from './InvestigationHeader.js';
import { GraphistryIframe } from './GraphistryIframe.js';
import {
    Panel,
    Alert,
    Image,
    Grid,
    Row,
    Col
} from 'react-bootstrap';
import { container } from '@graphistry/falcor-react-redux';
import styles from './styles.less';
import { switchScreen } from '../actions/app.js';
import SplitPane from 'react-split-pane';
import MainNav from './MainNav/MainNav.js';
import { ThreeBounce } from 'better-react-spinkit';


function renderVisualizationPanel(activeInvestigation) {
    const loadingGraph = (
        <div>
            Loading graph <ThreeBounce size={10}/>
        </div>
    );

    const runPivot = (
        <div>
            To get started, create and run a pivot!
        </div>
    );

    const placeholder = (
        <Grid>
            <Row>
                <Col>
                    <Image src="img/logo.png" responsive />
                </Col>
            </Row><Row>
                <Col>
                {
                    activeInvestigation.status.etling ? loadingGraph : runPivot
                }
                </Col>
            </Row>
        </Grid>
    );


    console.log({activeInvestigation});
    return (
        activeInvestigation.url ?
            <GraphistryIframe src={activeInvestigation.url} />
            : placeholder
    );
}

function renderInvestigationBody(app, activeInvestigation, templates) {
    const relevantTemplates =
        activeInvestigation.tags.length > 0 ?
            templates.filter(template =>
                _.intersection(template.tags, activeInvestigation.tags).length > 0
            ) :
            templates;

    return (
        <div className={`main-panel ${styles['investigation-all']}`}>
            <InvestigationHeader data={app} activeInvestigation={activeInvestigation} />

            <div className={styles['investigation-split']}>
                <SplitPane split="horizontal" defaultSize="60%" minSize={0}>
                    {
                        activeInvestigation.status && renderVisualizationPanel(activeInvestigation)
                    }
                   <Investigation data={activeInvestigation} templates={relevantTemplates}/>
               </SplitPane>
            </div>

        </div>
    );
}

function renderInvestigationPlaceholder(switchScreen) {
    return (
        <div className="main-panel" style={{width: 'calc(100% - 90px)', height: '100%'}}>
            <Panel>
                <Alert bsStyle="danger">
                    <h4>No Investigation to Open!</h4>
                    <p>
                        Please&nbsp;
                            <a href='#' onClick={() => switchScreen('home')}>create an investigation</a>
                        &nbsp;first.
                    </p>
                </Alert>
            </Panel>
        </div>
    );
}

function renderInvestigationScreen({ app, activeInvestigation, templates, switchScreen }) {
return (
        <MainNav activeScreen='investigation'>{
            activeInvestigation !== undefined ?
                 renderInvestigationBody(app, activeInvestigation, templates) :
                 renderInvestigationPlaceholder(switchScreen)
        }</MainNav>
    );
}

function mapStateToFragment({ currentUser: {templates = []} } = {}) {
    return `{
        currentUser: {
            activeInvestigation: ${Investigation.fragment()},
            templates: {
                length, [0...${templates.length}]: {
                    name, id, tags
                }
            }
        }
    }`;
}

function mapFragmentToProps(app = {}) {
    const currentUser = app.currentUser || {}

    return {
        app: app,
        activeInvestigation: currentUser.activeInvestigation,
        templates: currentUser.templates,
    };
}

export default container(
    mapStateToFragment,
    mapFragmentToProps,
    {
        switchScreen: switchScreen
    }
)(renderInvestigationScreen);
