import { InvestigationHeader } from '../index.js';
import { PivotTable } from 'pivot-shared/pivots';
import styles from 'pivot-shared/styles.less';

import {
    Alert,
    Button,
    Tooltip, 
    Glyphicon, 
    OverlayTrigger
} from 'react-bootstrap';

export default function Investigation({
    id, status, pivots = [], templates, investigations, 
    searchPivot, insertPivot, splicePivot, dismissAlert,
    graphInvestigation, saveInvestigation, togglePivots, selectInvestigation }) {

    const bStyle = (status && status.msgStyle) ? status.msgStyle : 'default';

    return (
        <div className={styles.pivots}>
            { status && !status.ok ?
                <Alert bsStyle={status.msgStyle || 'danger'} className={styles.alert} onDismiss={dismissAlert}>
                    <strong> {status.message} </strong>
                </Alert>
                : null
            }
            <InvestigationHeader investigations={investigations}
                                 selectInvestigation={selectInvestigation} />

            <OverlayTrigger placement="bottom" overlay={
                    <Tooltip id={`tooltip-play-all`}>Run all steps</Tooltip>
                }>
                <Button bsStyle={bStyle}
                        className={styles['play-all']}
                        onClick={() =>
                            graphInvestigation({investigationId: id, length: pivots.length}
                        )}>
                    <Glyphicon glyph="play" />
                </Button>
            </OverlayTrigger>

            <PivotTable id={id}
                        pivots={pivots}
                        status={status}
                        templates={templates}
                        insertPivot={insertPivot}
                        splicePivot={splicePivot}
                        searchPivot={searchPivot}
                        dismissAlert={dismissAlert}
                        togglePivots={togglePivots}
                        saveInvestigation={saveInvestigation}
                        />
        </div>
    );
}
