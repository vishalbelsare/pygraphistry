import { Button } from 'react-bootstrap';
import mainStyles from '../../styles.less';
import InvestigationTags from './investigation-tags';
import { BootstrapTable, TableHeaderColumn } from 'react-bootstrap-table';

import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);

export default function InvestigationTable({
  investigations = [],
  switchScreen,
  setInvestigationParams,
  selectHandler,
  selectInvestigation,
  copyInvestigation
}) {
  function tagsFormatter(tags = [], row) {
    const tagsArray = tags.map((tag, i) => ({ id: i, text: tag }));
    return (
      <div>
        <InvestigationTags
          tags={tagsArray}
          investigationId={row.id}
          setInvestigationParams={setInvestigationParams}
        />
      </div>
    );
  }

  function nameFormatter(name, row) {
    return (
      <a
        href={`/pivot/investigation/${row.id}`}
        onClick={e => {
          if (e.metaKey) {
            e.stopPropagation();
          } else {
            e.preventDefault();
            selectInvestigation(row.id);
            switchScreen('investigation');
          }
        }}>
        {name}
      </a>
    );
  }

  function idFormatter(id) {
    return (
      <div>
        <Button onClick={() => copyInvestigation(id)}>Copy</Button>
      </div>
    );
  }

  function dateFormatter(epoch) {
    return new Date(epoch).toLocaleString();
  }

  function onAfterSaveCell(row, column) {
    if (['name', 'description'].includes(column)) {
      setInvestigationParams({ [column]: row[column] }, row.id);
    } else {
      log.error('Cannot edit column' + column);
    }
  }

  function selectAllHandler(selected, rows) {
    selectHandler(rows, selected);
  }

  const selectRowProp = {
    mode: 'checkbox',
    clickToSelect: false,
    onSelect: selectHandler,
    onSelectAll: selectAllHandler,
    bgColor: '#fee'
  };
  const cellEditProp = {
    mode: 'click',
    blurToSave: true,
    afterSaveCell: onAfterSaveCell
  };

  return (
    <div className={mainStyles['investigation-table']}>
      <BootstrapTable
        data={investigations.filter(Boolean)}
        selectRow={selectRowProp}
        cellEdit={cellEditProp}
        striped={false}
        hover={true}
        pagination={true}
        options={{ defaultSortName: 'modifiedOn', defaultSortOrder: 'desc' }}>
        <TableHeaderColumn dataField="id" isKey={true} hidden={true} editable={false} />
        <TableHeaderColumn
          dataField="name"
          dataSort={true}
          width="200px"
          dataFormat={nameFormatter}>
          Name
        </TableHeaderColumn>
        <TableHeaderColumn dataField="description">Description</TableHeaderColumn>
        <TableHeaderColumn
          dataField="modifiedOn"
          dataSort={true}
          editable={false}
          dataFormat={dateFormatter}
          width="180px"
          dataAlign="center">
          Last Modified
        </TableHeaderColumn>

        <TableHeaderColumn
          dataField="tags"
          dataFormat={tagsFormatter}
          width="200px"
          editable={false}>
          Tags
        </TableHeaderColumn>

        <TableHeaderColumn dataField="id" dataFormat={idFormatter} width="172px" editable={false}>
          Actions
        </TableHeaderColumn>
      </BootstrapTable>
    </div>
  );
}
