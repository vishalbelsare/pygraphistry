import { PivotTable } from 'pivot-shared/pivots';
import styles from './investigations.less';

import {
    Alert,
    Button,
    Tooltip,
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
			<div className={styles.description}><strong>Investigation Description</strong><br></br><br></br>Welcome to the botnet investigation demo, this is a generic investigation description, we need to implement an editable section here.<br></br><br></br></div>
			<div className={styles.layoutSwitcher}>
				<strong>Layout Type</strong><br></br><br></br>
					<OverlayTrigger placement="bottom" overlay={
                    <Tooltip id={`tooltip-play-all`}>The force directed layout is great for seeing clusters and patterns within your data, it creates a physical simulation of the entities in your graph, and arranges them based on proximity and gravity</Tooltip>
                }>
						<Button className={styles['layoutButton']}>
							Force Directed
						</Button>
					</OverlayTrigger>
				<span>  </span>
					<OverlayTrigger placement="bottom" overlay={
                    <Tooltip id={`tooltip-play-all`}>The investigation tree layout lets you visualize your data how its imported via each pivot in your template, this is great for gaining insight into which elements were imported by which pivot</Tooltip>
                }>
						<Button className={styles['layoutButton']}
								>
							Investigation Tree
						</Button>
					</OverlayTrigger>	
				<br></br><br></br>
			</div>
			<div className={styles.rule}></div>
            <OverlayTrigger placement="bottom" overlay={
                    <Tooltip id={`tooltip-play-all`}>Run all steps</Tooltip>
                }>
                <Button bsStyle={bStyle}
                        className={styles['play-all']}
                        onClick={() =>
                            graphInvestigation({investigationId: id, length: pivots.length}
                        )}>
                    Run All
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
			<div className={styles.rule}></div>
			<div className={styles.copyright}><strong>© Graphistry Inc. 2017</strong></div>
			<div className={styles.copyrightDetail}>Build 1.0<br></br><br></br></div>
        </div>
    );
}
