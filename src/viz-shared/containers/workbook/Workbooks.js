import React from 'react'
import Workbook from './Workbook';
import { connect } from 'reaxtor-redux';

function WorkbooksList({ open: workbook = [] } = {}) {
    return (
        <Workbook falcor={workbook}/>
    );
}

function mapStateToFragment({ workbooks = [] } = {}) {
    return `{
        length,
        open: ${
            Workbook.fragment(workbooks.open)
        }
    }`;
}

export default connect(
    mapStateToFragment,
)(WorkbooksList);
