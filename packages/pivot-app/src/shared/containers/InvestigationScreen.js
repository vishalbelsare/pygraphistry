import Investigation from './Investigation.js';
import InvestigationHeader from './InvestigationHeader.js';
import Sidebar from './Sidebar.js';
import {
    Panel,
    Alert
} from 'react-bootstrap';
import { container } from '@graphistry/falcor-react-redux';
import styles from './styles.less';
import { switchScreen } from '../actions/app.js';
import SplitPane from 'react-split-pane';

function renderInvestigationBody(app, activeInvestigation, templates) {
    return (
        <div className={`main-panel ${styles['investigation-all']}`}>
            <InvestigationHeader data={app} activeInvestigation={activeInvestigation} />

            <div className={styles['investigation-split']}>
                <SplitPane split="horizontal" defaultSize="60%" minSize={0}>
                   <iframe allowFullScreen="true" scrolling="no" className={styles.iframe}
                        src={activeInvestigation.url} />
                   <Investigation data={activeInvestigation} templates={templates}/>
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
    const body = activeInvestigation !== undefined ?
                 renderInvestigationBody(app, activeInvestigation, templates) :
                 renderInvestigationPlaceholder(switchScreen);

    return (
        <div className="wrapper">
            <Sidebar activeScreen='investigation'/>
            { body }
        </div>
    );
}

function mapStateToFragment({ currentUser: {templates = []} } = {}) {
    return `{
        currentUser: {
            activeInvestigation: ${Investigation.fragment()},
            templates: {
                length, [0...${templates.length}]: {
                    name, id
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
