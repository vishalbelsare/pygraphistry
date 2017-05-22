import React from 'react';
import styles from './styles.less';
import mapPropsStream from 'recompose/mapPropsStream';

function stopPropagationIfAnchor(e) {
    const { target } = e;
    if (target && target.tagName && target.tagName.toLowerCase() === 'a') {
        e.stopPropagation();
    }
}

const MemoizeStyleProps = mapPropsStream((props) => {

    const cornerStyle = { lineHeight: 'auto' };
    const cellStyle = { maxWidth: 'auto', maxHeight: 'auto', lineHeight: 'auto' };
    const colCellStyle = { minWidth: 'auto', minHeight: 'auto', lineHeight: 'auto' };
    const colHeaderStyle = { width: 'auto', minHeight: 'auto', lineHeight: 'auto' };
    const rowCellStyle = { minHeight: 'auto', minWidth: 'auto', lineHeight: 'auto' };
    const rowHeaderStyle = { height: 'auto', minWidth: 'auto', lineHeight: 'auto' };
    const scrollerStyle = { width: 'auto', height: 'auto' };
    const tableStyle = { transform: `translate3d(0px, 0px, 0px)` };
    const tbodyStyle = { transform: `translate3d(0px, 0px, 0px)` };
    const tableContainerStyle = { width: 'auto', height: 'auto', overflow: 'hidden', paddingTop: 0 };

    return props.scan((prev, props) => {

        let {
            bodyX, bodyY,
            width, height,
            startCol, startRow,
            rowHeight, colWidth,
            bodyWidth, bodyHeight,
            scrollTop, scrollLeft,
            rowHeaderX, colHeaderY,
            colsPerPage, rowsPerPage,
            colHeaderWidth, rowHeaderHeight,
        } = props;

        if (typeof width === 'number') {
            bodyWidth = Math.max(width, bodyWidth);
        }

        if (typeof height === 'number') {
            bodyHeight = Math.max(height, bodyHeight);
        }

        cornerStyle.height = rowHeaderHeight || 'auto';
        cornerStyle.minWidth = colHeaderWidth || 'auto';
        cornerStyle.lineHeight = rowHeaderHeight ? `${rowHeaderHeight}px` : 'auto';

        cellStyle.maxWidth = colWidth || 'auto';
        cellStyle.maxHeight = rowHeight || 'auto';
        cellStyle.lineHeight = rowHeight ? `${rowHeight}px` : 'auto';

        colCellStyle.minWidth = colWidth || 'auto';
        colCellStyle.minHeight = rowHeaderHeight || 'auto';
        colCellStyle.lineHeight = rowHeaderHeight ? `${rowHeaderHeight}px` : 'auto';

        colHeaderStyle.width = colWidth || undefined;
        colHeaderStyle.minHeight = rowHeaderHeight || 'auto';
        colHeaderStyle.lineHeight = rowHeaderHeight ? `${rowHeaderHeight}px` : 'auto';

        rowCellStyle.minHeight = rowHeight || 'auto';
        rowCellStyle.minWidth = colHeaderWidth || 'auto';
        rowCellStyle.lineHeight = rowHeight ? `${rowHeight}px` : 'auto';

        rowHeaderStyle.height = rowHeight || undefined;
        rowHeaderStyle.minWidth = colHeaderWidth || 'auto';
        rowHeaderStyle.lineHeight = rowHeight ? `${rowHeight}px` : 'auto';

        scrollerStyle.width = width;
        scrollerStyle.height = height;

        colHeaderStyle.transform = `translate3d(0px, ${colHeaderY}px, 0px)`;
        rowHeaderStyle.transform = `translate3d(${rowHeaderX}px, 0px, 0px)`;
        cornerStyle.transform = `translate3d(${rowHeaderX}px, ${colHeaderY}px, 0px)`;

        tableStyle.transform = `translate3d(${bodyX}px, ${bodyY}px, 0px)`;
        tbodyStyle.transform = `translate3d(0px, ${rowHeaderHeight || 0}px, 0px)`;

        tableContainerStyle.width = bodyWidth || 'auto';
        tableContainerStyle.height = bodyHeight || 'auto';

        props = Object.create(props);

        props.cornerStyle = { ...cornerStyle };
        props.cellStyle = { ...cellStyle };
        props.colCellStyle = { ...colCellStyle };
        props.colHeaderStyle = { ...colHeaderStyle };
        props.rowCellStyle = { ...rowCellStyle };
        props.rowHeaderStyle = { ...rowHeaderStyle };
        props.scrollerStyle = { ...scrollerStyle };
        props.tableStyle = { ...tableStyle };
        props.tbodyStyle = { ...tbodyStyle };
        props.tableContainerStyle = { ...tableContainerStyle };

        if (scrollTop !== prev.scrollTop ||
            scrollLeft !== prev.scrollLeft) {
            props.setScrollPosition = (ref) => {
                if (ref) {
                    ref.scrollTop = scrollTop;
                    ref.scrollLeft = scrollLeft;
                }
            };
        }

        return props;
    }, {});
});

function DataGrid(props) {

    const {
        loading,
        cellStyle,
        renderCell,
        cornerStyle,
        colCellStyle,
        rowCellStyle,
        colHeaderStyle,
        rowHeaderStyle,
        onWheel, onScroll,
        setScrollPosition,
        startCol, startRow,
        renderColHeaderCell,
        renderRowHeaderCell,
        colsPerPage, rowsPerPage,
        onRowSelect, onColHeaderSelect,
        scrollerStyle, tableContainerStyle,
        tableStyle, tbodyStyle
    } = props;

    let col, row, cell, cells, thead, tbody, colIndex = -1, rowIndex = -1;

    if (renderColHeaderCell) {
        thead = new Array(colsPerPage + Number(Boolean(renderRowHeaderCell)));
        if (renderRowHeaderCell) {
            cell = renderRowHeaderCell(startRow + rowsPerPage - 1, props, true);
            thead.push(
                <th key='grid-corner-cell'>
                    <div style={rowCellStyle}>
                        <div className={styles['grid-head-row-cell-content']}>
                            {cell}
                        </div>
                        <div className={styles['grid-head-row-cell-wrapper']}>
                            <div style={cornerStyle}
                                 className={`${styles['grid-head-col-cell']} ${
                                               styles['grid-head-row-cell']} ${
                                               styles['grid-head-corner-cell']}`}>
                                {React.cloneElement(cell)}
                                {loading && <span className='Select-loading'/> || undefined}
                            </div>
                        </div>
                    </div>
                </th>
            );
        }
        while (++colIndex < colsPerPage) {
            col = startCol + colIndex;
            thead.push(
                <th data-col-index={col}
                    onClick={onColHeaderSelect}
                    key={`grid-col-${col}-cell`}>
                    <div style={colCellStyle}>
                        <div style={colHeaderStyle}
                             className={styles['grid-head-col-cell']}>
                            {renderColHeaderCell(col, props)}
                        </div>
                    </div>
                </th>
            );
        }
        colIndex = -1;
    }

    tbody = new Array(rowsPerPage);

    while (++rowIndex < rowsPerPage) {
        row = startRow + rowIndex;
        cells = new Array(
            Number(Boolean(renderRowHeaderCell)) +
            Number(Boolean(renderCell)) * colsPerPage
        );
        if (renderRowHeaderCell) {
            cell = renderRowHeaderCell(row, props);
            cells.push(
                <td key={`grid-row-${row}-cell`}
                    className={styles['grid-head-cell']}>
                    <div style={rowCellStyle}>
                        <div className={styles['grid-head-row-cell-content']}>
                            {cell}
                        </div>
                        <div className={styles['grid-head-row-cell-wrapper']}>
                            <div style={rowHeaderStyle}
                                 className={`${styles['grid-head-row-cell']} ${
                                   (row % 2) ? styles['grid-cell-odd'] :
                                               styles['grid-cell-even']}`}>
                                {React.cloneElement(cell)}
                            </div>
                        </div>
                    </div>
                </td>
            );
        }
        if (renderCell) {
            while (++colIndex < colsPerPage) {
                col = startCol + colIndex;
                cells.push(
                    <td onClick={stopPropagationIfAnchor}
                        key={`grid-col-${col}-row-${row}-cell`}>
                        <div style={cellStyle}
                             className={`${styles['grid-cell']} ${
                               (row % 2) ? styles['grid-cell-odd'] :
                                           styles['grid-cell-even']}`}>
                            {renderCell(col, row, props)}
                        </div>
                    </td>
                );
            }
            colIndex = -1;
        }

        tbody.push(
            <tr key={`grid-row-${row}`} data-row-index={row} onClick={onRowSelect}>
                {cells}
            </tr>
        );
    }

    return (
        <div className={styles['grid-scroller-container']}>
            <div className={styles['grid-scroller']}
                 onWheel={onWheel} onScroll={onScroll}
                 ref={setScrollPosition} style={scrollerStyle}>
                <div style={tableContainerStyle}>
                    <table className={styles['grid']} style={tableStyle}>
                        <tbody style={tbodyStyle}>
                            {tbody}
                        </tbody>
                        {/* specify <thead> as <tfoot> because tfoot creates a higher stacking context */}
                        <tfoot>
                            <tr>
                                {thead}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
}

DataGrid = MemoizeStyleProps(DataGrid);

export { DataGrid };
