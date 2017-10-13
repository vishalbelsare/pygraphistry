import WelcomeBar from './welcome-bar';
import mainStyles from 'pivot-shared/styles.less';
import { InvestigationTable } from 'pivot-shared/investigations';
import { Panel, Button, Tooltip, Glyphicon, OverlayTrigger } from 'react-bootstrap';

import { Subject } from 'rxjs/Subject';
import mapPropsStream from 'recompose/mapPropsStream';
import createEventHandler from 'recompose/createEventHandler';

const TrackSelectedInvestigations = mapPropsStream(propsStream => {
  const { handler: onUpdate, stream: selects } = createEventHandler();
  const { handler: onRemove, stream: deletes } = createEventHandler();

  const selectHandler = (row, selected) =>
    onUpdate({
      type: 'update',
      selected: selected,
      ids: Array.isArray(row) ? row.map(x => x.id) : [row.id]
    });

  return propsStream.multicast(
    () => new Subject(),
    propsStream => {
      return selects
        .merge(deletes.mapTo({ type: 'delete' }))
        .scan(scanSelections, { selection: [] })
        .withLatestFrom(propsStream, ({ ids }, { user, deleteInvestigations }) => [
          ids,
          user,
          deleteInvestigations
        ])
        .do(deleteSelectedIds)
        .ignoreElements()
        .merge(propsStream.map(mapToProps));

      function scanSelections({ selection }, { ids, type, selected }) {
        if (type === 'delete') {
          return { selection: [], ids: selection };
        } else if (selected) {
          return { selection: selection.concat(ids) };
        }
        return { selection: _.reject(selection, x => ids.includes(x)) };
      }

      function deleteSelectedIds([ids, user, deleteInvestigations]) {
        if (ids !== undefined) {
          deleteInvestigations(user.id, ids);
        }
      }

      function mapToProps(props) {
        return { ...props, selectHandler, deleteHandler: onRemove };
      }
    }
  );
});

function MainScreen({
  user,
  investigations,
  numTemplates,
  switchScreen,
  setInvestigationParams,
  copyInvestigation,
  createInvestigation,
  selectInvestigation,
  selectHandler,
  deleteHandler
}) {
  if (user === undefined) {
    return null;
  }

  return (
    <Panel className={mainStyles['main-panel-panel']}>
      <WelcomeBar user={user} numTemplates={numTemplates} investigations={investigations} />
      <Panel header="Open Investigations" className={mainStyles.panel}>
        <div className={mainStyles['investigations-buttons']}>
          <OverlayTrigger
            placement="top"
            overlay={<Tooltip id="AddNewInvestigationTooltip">Add New Investigation</Tooltip>}>
            <Button
              onClick={() => createInvestigation(user.id)}
              className={`btn-primary ${mainStyles['add-new-investigation']}`}>
              <Glyphicon glyph="plus" />
            </Button>
          </OverlayTrigger>
          <OverlayTrigger
            placement="top"
            overlay={
              <Tooltip id="DeleteInvestigationsTooltip">Delete Selected Investigations</Tooltip>
            }>
            <Button
              onClick={deleteHandler}
              className={`btn-danger ${mainStyles['delete-investigations']}`}>
              <Glyphicon glyph="trash" />
            </Button>
          </OverlayTrigger>
        </div>
        <InvestigationTable
          switchScreen={switchScreen}
          selectHandler={selectHandler}
          investigations={investigations}
          copyInvestigation={copyInvestigation}
          selectInvestigation={selectInvestigation}
          setInvestigationParams={setInvestigationParams}
        />
      </Panel>
    </Panel>
  );
}

export default TrackSelectedInvestigations(MainScreen);
