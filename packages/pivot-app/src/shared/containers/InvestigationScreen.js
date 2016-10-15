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

function renderInvestigationBody(selectedInvestigation) {
    return (
        <div className={`main-panel ${styles['investigation-all']}`}>
            <InvestigationHeader selectedInvestigation={selectedInvestigation} />

            <div className={styles['investigation-split']}>
                <SplitPane split="horizontal" defaultSize="60%" minSize={0}>
                   <iframe allowFullScreen="true" scrolling="no" className={styles.iframe}
                        src={selectedInvestigation.url} />
                   <Investigation data={selectedInvestigation}/>
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

function renderInvestigationScreen({ selectedInvestigation, switchScreen }) {
    const body = selectedInvestigation !== undefined ?
                 renderInvestigationBody(selectedInvestigation) :
                 renderInvestigationPlaceholder(switchScreen);

    return (
        <div className="wrapper">
            <Sidebar activeScreen='investigation'/>
            { body }
        </div>
    );
}

export default container(
    ({ selectedInvestigation } = {}) => `{
        selectedInvestigation: ${Investigation.fragment(selectedInvestigation)}
    }`,
    (state) => state,
    {
        switchScreen: switchScreen
    }
)(renderInvestigationScreen);
