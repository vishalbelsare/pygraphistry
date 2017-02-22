import { PivotTable } from 'pivot-shared/pivots';
import styles from './investigations.less';

import {
    Alert,
    Button,
    Tooltip, 
    Glyphicon, 
    OverlayTrigger
} from 'react-bootstrap';

export default function Investigation({
    id, status, pivots = [], templates,
    searchPivot, insertPivot, splicePivot, dismissAlert,
    graphInvestigation, saveInvestigation, togglePivots }) {

    const bStyle = (status && status.msgStyle) ? status.msgStyle : 'default';

    if (status.saved) {
        setTimeout(dismissAlert, 3000)
    }

    return (
        <div className={styles.pivots}>
            <OverlayTrigger placement="bottom" overlay={
                    <Tooltip id={`tooltip-play-all`}>Run all steps</Tooltip>
                }>
                <Button bsStyle={bStyle}
                        className={styles['play-all']}
                        onClick={() =>
                            graphInvestigation({investigationId: id, length: pivots.length}
                        )}>
                    Run All
                   { ' ' }
                    <Glyphicon glyph="play" style={{fontSize: '8px'}}/>
                </Button>
            </OverlayTrigger>
            { status && !status.ok ?
                <Alert bsStyle={status.msgStyle || 'danger'} className={styles.alert} onDismiss={dismissAlert}>
                    <strong> {status.message} </strong>
                </Alert>
                : null
            }

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
