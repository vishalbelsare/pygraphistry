import Investigation from './Investigation.js';
import InvestigationHeader from './InvestigationHeader.js';
import Sidebar from './Sidebar.js';

import { container } from '@graphistry/falcor-react-redux';
import styles from './styles.less';


function renderInvestigationScreen({ selectedInvestigation }) {
    if (selectedInvestigation === undefined) {
        return null;
    }

    return (
        <div className="wrapper">
            <Sidebar activeScreen='investigation'/>

            <div className="main-panel" style={{width: 'calc(100% - 90px)', height: '100%'}}>
                <InvestigationHeader selectedInvestigation={selectedInvestigation} />

                <div className="content" id="graphistry-canvas-wrapper"
                    style={{height: '-webkit-calc(100% - 60px - 250px)', width: '100%', overflow: 'hidden', minHeight: '0px'}}>
                    <iframe allowFullScreen="true" scrolling="no" className={styles.iframe}
                            src={selectedInvestigation.url} />
                </div>

                <footer className="footer" style={{height: '250px', overflow: 'auto'}}>
                    <div className="container-fluid">
                        <Investigation data={selectedInvestigation}/>
                    </div>
                </footer>
            </div>
        </div>
    );
}

export default container(
    ({ selectedInvestigation } = {}) => `{
        selectedInvestigation: ${Investigation.fragment(selectedInvestigation)}
    }`,
    (state) => state,
    {}
)(renderInvestigationScreen);
