import styles from './styles.less';

function stopPropagationIfAnchor(e) {
    const { target } = e;
    if (target && target.tagName && target.tagName.toLowerCase() === 'a') {
        e.stopPropagation();
    }
}

export function DataGrid(props) {

    let {
        renderCell,
        bodyX, bodyY,
        width, height,
        onWheel, onScroll,
        startCol, startRow,
        renderColHeaderCell,
        rowHeight, colWidth,
        bodyWidth, bodyHeight,
        scrollTop, scrollLeft,
        colHeaderX, colHeaderY,
        rowHeaderX, rowHeaderY,
        colsPerPage, rowsPerPage,
        onRowSelect, onColHeaderSelect,
        colHeaderWidth, rowHeaderHeight,
    } = props;

    const cellStyle = { maxWidth: colWidth || 'auto',
                        maxHeight: rowHeight || 'auto',
                        lineHeight: rowHeight ? `${rowHeight}px` : 'auto' };

    const colCellStyle = { minWidth: colWidth || 'auto',
                           minHeight: rowHeaderHeight || 'auto',
                           lineHeight: rowHeaderHeight ? `${rowHeaderHeight}px` : 'auto' };

    const colHeaderStyle = { width: colWidth || undefined,
                             minHeight: rowHeaderHeight || 'auto',
                             lineHeight: rowHeaderHeight ? `${rowHeaderHeight}px` : 'auto' };

    let col, row, cells, thead, tbody, colIndex = -1, rowIndex = -1;

    if (renderColHeaderCell) {
        thead = new Array(colsPerPage);
        while (++colIndex < colsPerPage) {
            col = startCol + colIndex;
            thead.push(
                <th data-col-index={col} onClick={onColHeaderSelect}>
                    <div style={colCellStyle}>
                        <div style={colHeaderStyle}
                             key={`grid-head-cell-${col}`}
                             className={styles['grid-head-cell']}>
                            {renderColHeaderCell(col, props)}
                        </div>
                    </div>
                </th>
            );
        }
        colIndex = -1;
    }

    if (renderCell) {
        tbody = new Array(rowsPerPage);
        while (++rowIndex < rowsPerPage) {
            row = startRow + rowIndex;
            cells = new Array(colsPerPage);
            while (++colIndex < colsPerPage) {
                col = startCol + colIndex;
                cells.push(
                    <td onClick={stopPropagationIfAnchor}>
                        <div style={cellStyle} className={`${styles['grid-cell']} ${
                                                 (row % 2) ? styles['grid-cell-odd'] :
                                                             styles['grid-cell-even']}`}>
                            {renderCell(col, row, props)}
                        </div>
                    </td>
                );
            }
            colIndex = -1;
            tbody.push(
                <tr data-row-index={row} onClick={onRowSelect}>
                    {cells}
                </tr>
            );
        }
    }

    if (typeof width === 'number') {
        bodyWidth = Math.max(width, bodyWidth);
    }

    if (typeof height === 'number') {
        bodyHeight = Math.max(height, bodyHeight);
    }

    const scrollerStyle = { width, height };
    const tbodyStyle = { transform: `translate3d(${bodyX}px, ${bodyY}px, 0px)` };
    const tfootStyle = { transform: `translate3d(${rowHeaderX}px, ${rowHeaderY}px, 0px)` };
    const tableContainerStyle = { width: bodyWidth, height: bodyHeight, overflow: 'hidden',
                                  paddingTop: rowHeaderHeight || 0, paddingLeft: colHeaderWidth || 0 };

    return (
        <div className={styles['grid-scroller-container']}>
            <div className={styles['grid-scroller']}
                 onWheel={onWheel} onScroll={onScroll}
                 ref={setScrollPosition} style={scrollerStyle}>
                <div style={tableContainerStyle}>
                    <table className={styles['grid']}>
                        <tbody style={tbodyStyle}>
                            {tbody}
                        </tbody>
                        {/* specify <thead> as <tfoot> because tfoot creates a higher stacking context */}
                        <tfoot style={tfootStyle}>
                            <tr>
                                {thead}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );

    function setScrollPosition(ref) {
        if (ref) {
            ref.scrollTop = scrollTop;
            ref.scrollLeft = scrollLeft;
        }
    }
}
