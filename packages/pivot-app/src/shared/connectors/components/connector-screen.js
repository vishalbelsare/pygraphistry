import WelcomeBar from './welcome-bar';
import ConnectorTable from './connector-table';
import styles from 'pivot-shared/styles.less';
import { Panel, Button, Tooltip, Glyphicon, OverlayTrigger } from 'react-bootstrap';

export default function ConnectorScreen({ connectors, switchScreen }) {
    return (
        <Panel className={styles['main-panel-panel']}>
            <WelcomeBar connectors={connectors}/>
            <Panel header="Available Connectors" className={styles.panel}>
                <div className={styles['investigations-buttons']}>
                    <OverlayTrigger placement="top"
                                    overlay={
                                        <Tooltip id="AddNewConnectorTooltip">
                                            Add New Connector
                                        </Tooltip>
                                    }>
                        <Button onClick={() => alert('Todo')}
                                className={`btn-primary ${styles['add-new-investigation']}`}>
                            <Glyphicon glyph="plus"/>
                        </Button>
                    </OverlayTrigger>
                </div>
                <ConnectorTable connectors={connectors} switchScreen={switchScreen}/>
            </Panel>
        </Panel>
    );
}
