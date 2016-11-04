import { container } from '@graphistry/falcor-react-redux';
import { ButtonGroup, Button, Glyphicon,
    OverlayTrigger, Tooltip
} from 'react-bootstrap';
import InvestigationDropdown from './InvestigationDropdown.js';
import {
    selectInvestigation,
    createInvestigation,
    saveInvestigation,
    copyInvestigation
} from '../actions/investigationScreen';

import styles from './styles.less';


function renderInvestigationHeader({investigations, activeInvestigation, createInvestigation,
                                    selectInvestigation, setInvestigationParams, copyInvestigation,
                                    saveInvestigation}) {
    return (
        <nav className={`navbar navbar-default navbar-fixed ${styles['investigation-nav']}`}>
            <div className={`container-fluid ${styles['investigation-header']}`}>
                <div>
                    <span className="simple-text" style={{display: 'inline-block', float: 'left'}}>
                        { investigations.length > 0 ?
                            <InvestigationDropdown data={investigations}
                                selectInvestigation={selectInvestigation}
                                activeInvestigation={activeInvestigation} />
                            : null
                        }
                    </span>
                </div>
                <div>
                    <ButtonGroup bsSize="large" className={styles['investigation-header-buttons']}>
                        <OverlayTrigger placement="bottom"
                            overlay={
                                <Tooltip id="CreateNewInvestigationTooltip">
                                    Create new investigation
                                </Tooltip>
                            }>
                            <Button onClick={createInvestigation}>
                                <Glyphicon glyph="plus" />
                            </Button>
                        </OverlayTrigger>
                        <OverlayTrigger placement="bottom"
                            overlay={
                                <Tooltip id="CopyInvestigationTooltip">
                                    Make a copy
                                </Tooltip>
                            }>
                            <Button onClick={(e) => copyInvestigation(activeInvestigation.id)}>
                                <Glyphicon glyph="duplicate" />
                            </Button>
                        </OverlayTrigger>
                        <OverlayTrigger placement="bottom"
                            overlay={
                                <Tooltip id="SaveInvestigationTooltip">
                                    Save changes
                                </Tooltip>
                            }>
                            <Button onClick={(e) => saveInvestigation(activeInvestigation.id)}>
                                <Glyphicon glyph="floppy-disk" />
                            </Button>
                        </OverlayTrigger>
                    </ButtonGroup>
                </div>
            </div>
        </nav>
    );
}

function mapStateToFragment() {
    return `{
        currentUser: {
            investigations: ${
                InvestigationDropdown.fragment()
            }
        }
    }`;
}

function mapFragmentToProps({ currentUser = {} } = {}) {
    return {
        investigations: currentUser.investigations || []
    };
}

export default container(
    mapStateToFragment,
    mapFragmentToProps,
    {
        selectInvestigation: selectInvestigation,
        createInvestigation: createInvestigation,
        saveInvestigation: saveInvestigation,
        copyInvestigation: copyInvestigation
    }

)(renderInvestigationHeader);
