import React from 'react';
import hoistStatics from 'recompose/hoistStatics';

function WithGridLayout(Component) {
    return function GridLayout(props) {
        return <Component {...props} {...getViewport(props)}/>;
    };
}

WithGridLayout = hoistStatics(WithGridLayout);

export { WithGridLayout };

function getViewport(props) {

    const { colWidth, rowHeight,
            scrollTop = 0, scrollLeft = 0,
            width = 'auto', height = 'auto',
            rowHeaderHeight = 0, colHeaderWidth = 0 } = props;

    let bodyX = 0, bodyY = 0,
        startCol = 0, colsPerPage = Infinity,
        startRow = 0, rowsPerPage = Infinity,
        colHeaderX = 0, colHeaderY = scrollTop,
        rowHeaderY = 0, rowHeaderX = scrollLeft;

    if (typeof width !== 'number') {
        rowHeaderX = -scrollLeft;
    } else {

        startCol = Math.floor(scrollLeft / colWidth);
        colsPerPage = Math.max(0, Math.floor((width - colHeaderWidth) / colWidth));

        bodyX = startCol * colWidth;
        colHeaderX = scrollLeft - (startCol * colWidth);
        rowHeaderX = (startCol * colWidth) - scrollLeft;
    }

    if (typeof height !== 'number') {
        colHeaderY = -scrollTop;
    } else {

        startRow = Math.floor(scrollTop / rowHeight);
        rowsPerPage = Math.max(0, Math.floor((height - rowHeaderHeight) / rowHeight));

        bodyY = startRow * rowHeight;
        colHeaderY = (startRow * rowHeight) - scrollTop;
    }

    return {
        bodyX, bodyY,
        width, height,
        startCol, startRow,
        rowHeight, colWidth,
        colHeaderX, colHeaderY,
        rowHeaderX, rowHeaderY,
        colsPerPage, rowsPerPage,
        colHeaderWidth, rowHeaderHeight,
    };
}
