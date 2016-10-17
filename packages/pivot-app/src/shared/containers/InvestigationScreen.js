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

function renderInvestigationBody(activeInvestigation) {
    return (
        <div className={`main-panel ${styles['investigation-all']}`}>
            <InvestigationHeader activeInvestigation={activeInvestigation} />

            <div className={styles['investigation-split']}>
                <SplitPane split="horizontal" defaultSize="60%" minSize={0}>
                   <iframe allowFullScreen="true" scrolling="no" className={styles.iframe}
                        src={activeInvestigation.url} />
                   <Investigation data={activeInvestigation}/>
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
    )
}

function renderInvestigationScreen({ activeInvestigation, switchScreen }) {
    const body = activeInvestigation !== undefined ?
                 renderInvestigationBody(activeInvestigation) :
                 renderInvestigationPlaceholder(switchScreen);

    return (
        <div className="wrapper">
            <Sidebar activeScreen='investigation'/>
            { body }
        </div>
    );
}

function mapFragmentToProps({ currentUser = {}} = {}) {
    return {
        activeInvestigation: currentUser.activeInvestigation
    };
}

export default container(
    ({ activeInvestigation } = {}) => `{
        currentUser: {
            activeInvestigation: ${Investigation.fragment(activeInvestigation)}
        }
    }`,
    mapFragmentToProps,
    {
        switchScreen: switchScreen
    }
)(renderInvestigationScreen);
