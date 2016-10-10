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

function renderInvestigationBody(selectedInvestigation) {
    return (
        <div className="main-panel" style={{width: 'calc(100% - 90px)', height: '100%'}}>
            <InvestigationHeader selectedInvestigation={selectedInvestigation} />

            <div className="content" id="graphistry-canvas-wrapper"
                 style={{
                     height: '-webkit-calc(100% - 60px - 250px)',
                     width: '100%', overflow: 'hidden', minHeight: '0px'
                 }}>
                <iframe allowFullScreen="true" scrolling="no" className={styles.iframe}
                        src={selectedInvestigation.url} />
            </div>

            <footer className="footer" style={{height: '250px', overflow: 'auto'}}>
                <div className="container-fluid">
                    <Investigation data={selectedInvestigation}/>
                </div>
            </footer>
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
