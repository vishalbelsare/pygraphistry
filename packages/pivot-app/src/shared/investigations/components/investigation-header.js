import styles from 'pivot-shared/styles.less';
import InvestigationDropdown from './investigation-dropdown';
import {
    Tooltip,
    Button, ButtonGroup,
    Glyphicon, OverlayTrigger
} from 'react-bootstrap';

export default function InvestigationHeader({
    user,
    investigations, activeInvestigation, createInvestigation,
    selectInvestigation, copyInvestigation, saveInvestigation
}) {
    return (
        <nav className={`navbar navbar-default navbar-fixed ${styles['investigation-nav']}`}>
            <div className={`container-fluid ${styles['investigation-header']}`}>
                <div>
                    <span className="simple-text" style={{display: 'inline-block', float: 'left'}}>
                        <InvestigationDropdown investigations={investigations}
                                               selectInvestigation={selectInvestigation}
                                               activeInvestigation={activeInvestigation} />
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
                            <Button onClick={() => createInvestigation(user.id)}>
                                <Glyphicon glyph="plus" />
                            </Button>
                        </OverlayTrigger>
                        <OverlayTrigger placement="bottom"
                            overlay={
                                <Tooltip id="CopyInvestigationTooltip">
                                    Make a copy
                                </Tooltip>
                            }>
                            <Button onClick={() => copyInvestigation(activeInvestigation.id)}>
                                <Glyphicon glyph="duplicate" />
                            </Button>
                        </OverlayTrigger>
                        <OverlayTrigger placement="bottom"
                            overlay={
                                <Tooltip id="SaveInvestigationTooltip">
                                    Save changes
                                </Tooltip>
                            }>
                            <Button onClick={() => saveInvestigation(activeInvestigation.id)}>
                                <Glyphicon glyph="floppy-disk" />
                            </Button>
                        </OverlayTrigger>
                    </ButtonGroup>
                </div>
            </div>
        </nav>
    );
}
