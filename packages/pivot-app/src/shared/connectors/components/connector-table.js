import { ConnectorRow } from 'pivot-shared/connectors';
import { BootstrapTable, TableHeaderColumn } from 'react-bootstrap-table';

import mainStyles from 'pivot-shared/styles.less';

function nameFormatter(name) {
  return <span>{name}</span>;
}

function descriptionFormatter(description, row) {
  return <span>{row.status.message}</span>;
}

function dateFormatter(epoch) {
  return new Date(epoch).toLocaleString();
}

export default function ConnectorTable({ connectors = [], selectHandler }) {
  function selectAllHandler(selected, rows) {
    selectHandler(rows, selected);
  }

  function idFormatter(id, row) {
    return <ConnectorRow id={id} data={row} />;
  }

  const selectRowProp = {
    mode: 'checkbox',
    clickToSelect: false,
    onSelect: selectHandler,
    onSelectAll: selectAllHandler,
    bgColor: '#fee'
  };

  return (
    <div className={mainStyles['investigation-table']}>
      <BootstrapTable
        data={connectors.filter(Boolean)}
        selectRow={selectRowProp}
        striped={false}
        hover={true}
        pagination={true}
        options={{ defaultSortName: 'name', defaultSortOrder: 'desc' }}>
        <TableHeaderColumn dataField="id" isKey={true} hidden={true} editable={false} />
        <TableHeaderColumn
          dataField="name"
          dataSort={true}
          width="200px"
          dataFormat={nameFormatter}>
          Name
        </TableHeaderColumn>
        <TableHeaderColumn dataField="message" dataFormat={descriptionFormatter}>
          Message
        </TableHeaderColumn>
        <TableHeaderColumn
          dataField="lastUpdated"
          dataSort={true}
          editable={false}
          dataFormat={dateFormatter}
          width="180px"
          dataAlign="center">
          Updated
        </TableHeaderColumn>
        <TableHeaderColumn dataField="id" dataFormat={idFormatter} width="172px" editable={false}>
          Actions
        </TableHeaderColumn>
      </BootstrapTable>
    </div>
  );
}
