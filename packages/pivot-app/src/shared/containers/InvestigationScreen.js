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

function renderInvestigationBody(activeInvestigation, templates) {
    return (
        <div className={`main-panel ${styles['investigation-all']}`}>
            <InvestigationHeader activeInvestigation={activeInvestigation} />

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

function renderInvestigationScreen({ activeInvestigation, templates, switchScreen }) {
    const body = activeInvestigation !== undefined ?
                 renderInvestigationBody(activeInvestigation, templates) :
                 renderInvestigationPlaceholder(switchScreen);

    return (
        <div className="wrapper">
            <Sidebar activeScreen='investigation'/>
            { body }
        </div>
    );
}

function mapStateToFragment({ currentUser = {templates: []} } = {}) {
    console.log('IS', currentUser);
    return `{
        currentUser: {
            activeInvestigation: ${Investigation.fragment()},
            templates: {
                length, [0...${currentUser.templates.length}]: {
                    name, id
                }
            }
        }
    }`;
}

function mapFragmentToProps({ currentUser = {}} = {}) {
    return {
        activeInvestigation: currentUser.activeInvestigation,
        templates: currentUser.templates
    };
}

export default container(
    mapStateToFragment,
    mapFragmentToProps,
    {
        switchScreen: switchScreen
    }
)(renderInvestigationScreen);
