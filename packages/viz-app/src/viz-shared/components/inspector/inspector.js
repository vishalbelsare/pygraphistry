import _ from 'underscore';
import styles from './styles.less';
import classNames from 'classnames';
import React, { PropTypes } from 'react';
import { ColumnPicker } from 'viz-shared/components/column-picker';
import { Tab, Tabs, Table, Pagination, FormGroup, FormControl, InputGroup, Button } from 'react-bootstrap';

const propTypes = {
    templates: React.PropTypes.array, //possible
    columns: React.PropTypes.array, //render
    rows: React.PropTypes.array,
    openTab: React.PropTypes.string,
    searchTerm: React.PropTypes.string,
    sortKey: React.PropTypes.string,
    sortOrder: React.PropTypes.string,
    toggleColumnSort: React.PropTypes.func,
    numPages: React.PropTypes.number,
    page: React.PropTypes.number,
    rowsPerPage: React.PropTypes.number,
    onSelect: React.PropTypes.func,
    onRowSelect: React.PropTypes.func,
    onPageSelect: React.PropTypes.func,
    onColumnsSelect: React.PropTypes.func,
    onSearch: React.PropTypes.func
};

const datatablePropTypes =
    _.extend(
        {entityType: React.PropTypes.string},
        propTypes);

class DataTable extends React.Component {
    constructor(props) {
        super(props);
    }

    render () {

        const onRowSelect = this.props.onRowSelect;
        const { rows: visibleRows = [] } = this.props;
        const componentType = this.props.openTab === 'points' ? 'point' : 'edge';

        const firstRow = this.props.rowsPerPage * (this.props.page - 1);

        const { templates, columns = [], entityType, dataLoading, searchTerm } = this.props;
        const renderColumns = columns.length && columns[0] ? columns : templates;
        const templatesArray = _.range(0, templates.length).map((i) => templates[i]);

        return (
            <div>
                <div className={styles['inspector-table-header']}>

                    {
                        <InputGroup style={{marginRight: '1em'}}>
                            <FormControl type="text"
                                value={this.props.searchTerm || ''} placeholder="Search"
                                onChange={(e) => this.props.onSearch(e.target.value) }
                                />
                        </InputGroup>
                    }

                     <Pagination
                        prev
                        next
                        first
                        last
                        ellipsis
                        boundaryLinks
                        items={this.props.numPages}
                        maxButtons={5}
                        activePage={this.props.page}
                        onSelect={this.props.onPageSelect} />

                    <span style={{ float: 'right' }}>
                        <ColumnPicker
                            id="InspectorColumnPicker"
                            placeholder="Pick columns"
                            value={columns}
                            loading={dataLoading}
                            options={templatesArray}
                            onChange={ (columns) => {
                                return this.props.onColumnsSelect({columns})
                            } }
                        />
                    </span>

                </div>
                <div className={styles['inspector-table-container']}>
                <Table className={styles['inspector-table']}
                    striped={true} bordered={true} condensed={true} hover={true}>
                <thead>
                    {renderColumns.map(({name}) => (
                        <th  className={ this.props.sortKey === name ? styles['isSorting'] : null }
                                onClick={ () => this.props.toggleColumnSort({name}) }>
                            {name === '_title' ? entityType : name}
                            { this.props.sortKey === name
                                ? <i className={`
                                    ${styles['sort-active']}
                                    fa fa-fw
                                    ${'fa-sort-' + this.props.sortOrder}`}></i>
                                : <i className={`
                                    ${styles['sort-inactive']}
                                    fa fa-fw fa-sort`}></i>
                            }
                        </th>))}
                </thead>
                <tbody>{
                   _.range(firstRow, firstRow + this.props.rowsPerPage)
                    .map((visibleRowIndex, x, y, row = visibleRows[visibleRowIndex]) => (
                        <tr onClick={!row ? undefined : onRowSelect.bind(null, {
                                index: row._index,
                                componentType: componentType
                        })}>{
                            renderColumns.map(({name}) => {
                                let cellValue = row && row[name];
                                if (cellValue == null || cellValue === '') {
                                    cellValue = '\u00a0'; /* nbsp forces height sizing*/
                                }
                                return <td>{cellValue}</td>;
                            })
                        }</tr>
                    ))}
                </tbody>
            </Table>
            </div>
        </div>);
    }
}

DataTable.propTypes = datatablePropTypes;

class Inspector extends React.Component {

    constructor(props) { super(props); }

    render() {
        return <div className={styles.inspector}>
            <Tabs className={styles.inspectorTabs}
                    activeKey={this.props.openTab}  onSelect={this.props.onSelect}>
                <Tab eventKey={'points'} title="Points">
                    <DataTable {...this.props} entityType={"Node"}/>
                </Tab>
                <Tab eventKey={'edges'} title="Edges">
                    <DataTable {...this.props} entityType={"Edge"}/>
                </Tab>
            </Tabs>
        </div>;
    }
}

Inspector.propTypes = propTypes;

export { Inspector };



