import styles from './investigation.less';
import { PivotTable } from 'pivot-shared/pivots';
import { InvestigationHeader } from 'pivot-shared/investigations';
import { InvestigationDetails } from './investigation-details';
import { Alert, Button, Tooltip, OverlayTrigger } from 'react-bootstrap';

const tooltipDelayShow = 750;
const tooltipRunAll = <Tooltip id="tooltip-play-all">Run and visualize all pivots</Tooltip>;

export default function Investigation({
  id,
  user,
  layout,
  status = {},
  description,
  time,
  $falcor,
  pivots = [],
  templates,
  investigations,
  searchPivot,
  insertPivot,
  splicePivot,
  togglePivots,
  saveLayout,
  dismissAlert,
  graphInvestigation,
  copyInvestigation,
  selectInvestigation,
  createInvestigation,
  saveInvestigation
}) {
  const bStyle = status.msgStyle || 'default';

  if (status.saved) {
    setTimeout(dismissAlert, 3000);
  }

  return (
    <div className={styles['investigation-pane']}>
      <InvestigationHeader
        key={`investigation-header:${id}`}
        id={id}
        user={user}
        layout={layout}
        saveLayout={saveLayout}
        investigations={investigations}
        copyInvestigation={copyInvestigation}
        saveInvestigation={saveInvestigation}
        selectInvestigation={selectInvestigation}
        createInvestigation={createInvestigation}>
        <InvestigationDetails
          layout={layout}
          $falcor={$falcor}
          saveLayout={saveLayout}
          description={description}
          time={time}
        />
        <div>
          <OverlayTrigger placement="bottom" delayShow={tooltipDelayShow} overlay={tooltipRunAll}>
            <Button
              bsStyle={bStyle}
              className={styles['play-all']}
              onClick={() =>
                graphInvestigation({
                  investigationId: id,
                  length: pivots.filter(({ enabled }) => enabled).length
                })}>
              Run All Pivots
            </Button>
          </OverlayTrigger>
          {!status.ok ? (
            <Alert
              bsStyle={status.msgStyle || 'danger'}
              className={styles.alert}
              onDismiss={dismissAlert}>
              <strong> {status.message} </strong>
            </Alert>
          ) : null}
        </div>
      </InvestigationHeader>
      <div className={styles['investigation-pivots']}>
        <PivotTable
          id={id}
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
      <div className={styles['investigation-footer']}>
        <div className={styles.rule} />
        <div className={styles.copyright}>
          <strong>© Graphistry Inc. 2017</strong>
        </div>
        <div className={styles.copyrightDetail}>
          Build 1.0<br />
          <br />
        </div>
      </div>
    </div>
  );
}
