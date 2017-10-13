import _ from 'underscore';
import { Alert } from 'react-bootstrap';
import styles from './event-table.less';
import { BootstrapTable, TableHeaderColumn } from 'react-bootstrap-table';

export default function EventTable({ fieldSummaries = {}, table = {} }) {
  if (_.isEmpty(fieldSummaries) || _.isEmpty(table)) {
    return (
      <Alert bsStyle="info">
        <h4>No data to show!</h4>
        <p>Please execute a pivot first.</p>
      </Alert>
    );
  }

  const fields = _.keys(fieldSummaries).sort();

  return (
    <BootstrapTable
      data={table}
      striped={true}
      condensed={true}
      pagination={true}
      bordered={true}
      tableContainerClass={styles['investigation-data']}
      options={{ sizePerPage: 5, hideSizePerPage: true }}>
      <TableHeaderColumn key="event-table-node" dataField="node" isKey={true} hidden={true} />
      {_.difference(fields, ['node']).map(field => (
        <TableHeaderColumn
          filter={getFilterOpts(fieldSummaries[field])}
          key={`event-table-${field}`}
          dataField={field}
          dataSort={true}>
          {field}
        </TableHeaderColumn>
      ))}
    </BootstrapTable>
  );
}

function getFilterOpts(summary) {
  if (summary.numDistinct > 0 && summary.values !== undefined) {
    return {
      type: 'SelectFilter',
      options: _.object(summary.values.map(x => [x, x]))
    };
  } else {
    return {
      type: 'TextFilter'
    };
  }
}
