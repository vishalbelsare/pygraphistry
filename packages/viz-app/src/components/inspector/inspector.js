import styles from './styles.less';
import classNames from 'classnames';
import { findDOMNode } from 'react-dom';
import { defaultFormat } from 'viz-app/formatters';
import { DataGrid } from 'viz-app/components/data-grid';
import { Pagination } from 'viz-app/components/pagination';
import { ColorPill } from 'viz-app/components/color-pill';
import { ColumnPicker } from 'viz-app/components/column-picker';
import {
    Tab,
    Tabs,
    Row,
    Col,
    Grid,
    Table,
    Button,
    FormGroup,
    FormControl,
    InputGroup
} from 'react-bootstrap';

export function Inspector(props) {
    return (
        <div style={props.style} className={styles.inspector}>
            <Tabs id="inspector-tabs" onSelect={props.onSelect} activeKey={props.openTab}>
                {(props.tabs || []).map(({ name, componentType }) => (
                    <Tab key={`inspector-tab-${name}`} eventKey={componentType} title={name} />
                ))}
            </Tabs>
            <DataTable {...props} entityType={props.openTab === 'edge' ? 'Edge' : 'Node'} />
        </div>
    );
}

const checkSearchInputValue = scanCheckSearchInputValue();

function DataTable(props) {
    const {
        width,
        page,
        numPages,
        openTab,
        searchTerm,
        columns,
        templates,
        colsPerPage,
        rowsPerPage,
        onPage,
        onSort,
        onSearch,
        onColumnsSelect,
        selectInspectorRow
    } = props;

    return (
        <Grid fluid style={{ padding: 0, margin: 0 }}>
            <Row
                style={{ padding: 0, paddingTop: 4, margin: 0 }}
                className={styles['inspector-header']}>
                <Col xs={4} lg={4} lg={4} style={{ paddingRight: 0, margin: 0 }}>
                    <InputGroup style={{ width: `100%` }}>
                        <InputGroup.Button>
                            <ColumnPicker
                                value={columns}
                                id="InspectorColumnPicker"
                                placeholder="Pick columns"
                                onChange={onColumnsSelect}
                                options={Array.from(templates)}
                            />
                        </InputGroup.Button>
                        <FormControl
                            type="text"
                            placeholder="Search"
                            defaultValue={searchTerm}
                            data-component-type={openTab}
                            ref={checkSearchInputValue(searchTerm)}
                            onChange={e => onSearch(e.target.value)}
                        />
                    </InputGroup>
                </Col>
                <Col xs={8} lg={8} lg={8} style={{ paddingTop: 0, margin: 0 }}>
                    <Pagination
                        ellipsis
                        next
                        prev
                        page={page}
                        pages={numPages}
                        onSelect={onPage}
                        maxButtons={Math.floor(width / 75)}
                    />
                </Col>
            </Row>
            <Row style={{ padding: 0, margin: 0, height: `100%` }}>
                <Col xs={12} lg={12} lg={12} style={{ padding: 0, margin: 0 }}>
                    <DataGrid
                        {...props}
                        renderCell={renderCell}
                        onRowSelect={onRowSelect}
                        onColHeaderSelect={onColHeaderSelect}
                        renderColHeaderCell={renderColHeaderCell}
                        renderRowHeaderCell={renderRowHeaderCell}
                    />
                </Col>
            </Row>
        </Grid>
    );

    function onRowSelect({ currentTarget: target }) {
        const { rows, startRow } = props;
        const { rowIndex } = target.dataset;
        const row = rows[rowIndex - startRow];
        if (row && typeof row._index === 'number') {
            selectInspectorRow({
                index: row._index,
                componentType: openTab === 'event' ? 'point' : openTab
            });
        }
    }

    function onColHeaderSelect({ currentTarget: target }) {
        const { cols } = props;
        const { colIndex } = target.dataset;
        const col = cols[colIndex];
        if (col && col.name) {
            onSort(col.name);
        }
    }
}

function scanCheckSearchInputValue(componentType) {
    return function checkSearchInputValue(searchTerm) {
        return function checkSearchInputValueRef(ref) {
            if (
                ref &&
                ref.value !== searchTerm &&
                ref.props &&
                componentType !== (componentType = ref.props['data-component-type'])
            ) {
                findDOMNode(ref).value = searchTerm;
            }
        };
    };
}

function renderRowHeaderCell(rowIndex, { rows, startRow }, isTopLeftCell) {
    const show = !isTopLeftCell && rows[rowIndex - startRow];
    return (
        <span className={show ? '' : styles['head-row-cell-content-hidden']}>
            {rowIndex + 1 /* force header to measure width of last rowIndex */}
        </span>
    );
}

function renderColHeaderCell(colIndex, { cols, sortKey, sortOrder, entityType }) {
    const col = cols[colIndex];

    if (!col) {
        return '';
    }

    const { name = '\u00a0' } = col;
    const isSorting = sortKey === name;
    const label = name === '_title' ? entityType : name;

    return (
        <Button title={label} block active={isSorting} className={styles['inspector-header-cell']}>
            <i
                className={classNames({
                    fa: true,
                    'fa-fw': true,
                    'fa-sort': !isSorting,
                    [styles['sort-active']]: isSorting,
                    [`fa-sort-${sortOrder}`]: isSorting,
                    [styles['sort-inactive']]: !isSorting
                })}
            />
            <span>{label}</span>
        </Button>
    );
}

function renderCell(colIndex, rowIndex, { cols, rows, startCol, startRow, loadingRow }) {
    const col = cols[colIndex];
    const row = rows[rowIndex - startRow];

    let dataType,
        value = '';

    if (row && col) {
        if (
            row === loadingRow ||
            ((value = row[col.name]) === undefined && row.$__status === 'pending')
        ) {
            return (
                <p className={styles['loading-cell']}>
                    <i className="fa fa-ellipsis-h" />
                </p>
            );
        }

        if (value != null && value !== '') {
            value = col.dataType === 'date' ? value : '' + value;
            dataType = col.dataType;
        }
    }

    const displayString = defaultFormat(value, dataType);

    return dataType === 'color' && value ? (
        <span>
            <ColorPill color={value} /> {value}
        </span>
    ) : (
        <span title={value} dangerouslySetInnerHTML={{ __html: displayString }} />
    );
}
