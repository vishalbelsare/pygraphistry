import styles from './styles.less';
import classNames from 'classnames';
import { DataGrid } from 'viz-shared/components/data-grid';
import { Pagination } from 'viz-shared/components/pagination';
import { ColumnPicker } from 'viz-shared/components/column-picker';
import {
    Tab, Tabs, Row, Col, Grid, Table,
    Button, FormGroup, FormControl, InputGroup
} from 'react-bootstrap';

export function Inspector(props) {
    return (
        <div style={props.style} className={styles.inspector}>
            <Tabs onSelect={props.onSelect}
                  activeKey={props.openTab}
                  className={styles.inspectorTabs}>
                <Tab eventKey='point' title='Points'>
                    <DataTable {...props} entityType='Node'/>
                </Tab>
                <Tab eventKey='edge' title='Edges'>
                    <DataTable {...props} entityType='Edge'/>
                </Tab>
            </Tabs>
        </div>
    );
}

function DataTable(props) {

    const { columns, templates, colsPerPage, rowsPerPage,
            loading, width, page, numPages, openTab, searchTerm,
            onPage, onSort, onSearch, onColumnsSelect, selectInspectorRow } = props;

    return (
        <Grid fluid style={{ padding: 0, margin: 0 }}>
            <Row style={{ padding: 0, paddingTop: 4, margin: 0 }}
                 className={styles['inspector-header']}>
                <Col xs={4} lg={4} lg={4} style={{ paddingRight: 0, margin: 0 }}>
                    <InputGroup style={{ width: `100%` }}>
                        <InputGroup.Button>
                            <ColumnPicker value={columns}
                                          loading={loading}
                                          id='InspectorColumnPicker'
                                          placeholder='Pick columns'
                                          onChange={onColumnsSelect}
                                          options={Array.from(templates)}/>
                        </InputGroup.Button>
                        <FormControl type='text'
                                     value={searchTerm}
                                     placeholder='Search'
                                     onChange={(e) => onSearch(e.target.value)}/>
                    </InputGroup>
                </Col>
                <Col xs={8} lg={8} lg={8} style={{ paddingTop: 0, margin: 0 }}>
                    <Pagination ellipsis
                                next prev
                                page={page}
                                pages={numPages}
                                onSelect={onPage}
                                maxButtons={Math.floor(width / 75)}/>
                </Col>
            </Row>
            <Row style={{ padding: 0, margin: 0, height: `100%` }}>
                <Col xs={12} lg={12} lg={12} style={{ padding: 0, margin: 0 }}>
                    <DataGrid {...props}
                              renderCell={renderCell}
                              onRowSelect={onRowSelect}
                              onColHeaderSelect={onColHeaderSelect}
                              renderColHeaderCell={renderColHeaderCell}/>
                </Col>
            </Row>
        </Grid>
    );

    function onRowSelect({ currentTarget: target }) {
        const { rows, startRow } = props;
        const { rowIndex } = target.dataset;
        const row = rows[rowIndex - startRow];
        if (row) {
            selectInspectorRow({
                index: row._index,
                componentType: openTab
            });
        }
    }

    function onColHeaderSelect({ currentTarget: target }) {
        const { cols } = props;
        const { colIndex } = target.dataset;
        const col = cols[colIndex];
        if (col) {
            onSort(col.name);
        }
    }
}

function renderColHeaderCell(colIndex, { cols, sortKey, sortOrder, entityType }) {

    const col = cols[colIndex];

    if (!col) {
        return '';
    }

    const { name = '\u00a0' } = col;
    const isSorting = sortKey === name;

    return (
        <Button block active={isSorting}
                href='javascript:void(0)'
                className={styles['inspector-header-cell']}>
            <span>{name === '_title' ? entityType : name}</span>
            <i className={classNames({
                'fa': true,
                'fa-fw': true,
                'fa-sort': !isSorting,
                [styles['sort-active']]: isSorting,
                [`fa-sort-${sortOrder}`]: isSorting,
                [styles['sort-inactive']]: !isSorting
            })}/>
        </Button>
    );
}

function renderCell(colIndex, rowIndex, { cols, rows, startRow }) {

    const col = cols[colIndex];

    if (col) {

        const row = rows[rowIndex - startRow];

        if (row && row.rowIsLoading && colIndex === 0) {
            return [
                `Loading row ${row.pendingIndex}`,
                '\u00a0' /* force space between text and icon */,
                <i className='fa fa-ellipsis-h'/>
            ];
        }

        const { name = '' } = col;
        const value = row && name && row[name];

        if (value != null && value !== '') {
            return (
                <span dangerouslySetInnerHTML={{ __html: value }}/>
            );
        }
    }

    return '\u00a0' /* nbsp forces height sizing*/;
}
