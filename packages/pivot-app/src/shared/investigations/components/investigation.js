import EventTable from './event-table';
import { Tab, Tabs, Alert } from 'react-bootstrap';
import { PivotTable } from 'pivot-shared/pivots';
import styles from 'pivot-shared/styles.less';

export default function Investigation({
    id, status, pivots = [], templates, eventTable,
    searchPivot, insertPivot, splicePivot, dismissAlert,
    graphInvestigation, saveInvestigation, togglePivots
}) {
    return (
        <div className={styles.pivots}>
            { status && !status.ok ?
                <Alert bsStyle={status.msgStyle || 'danger'} className={styles.alert} onDismiss={dismissAlert}>
                    <strong> {status.message} </strong>
                </Alert>
                : null
            }
            <Tabs defaultActiveKey={1} id="investigation-bottom-tabbar" className={styles.investigationTabs}>
                <Tab eventKey={1} title="Pivots">
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
                                graphInvestigation={graphInvestigation}
                                />
                </Tab>
                <Tab eventKey={2} title="Events">
                    { eventTable &&
                        <EventTable { ...eventTable }/>
                        || undefined
                    }
                </Tab>
            </Tabs>
        </div>
    );
}

