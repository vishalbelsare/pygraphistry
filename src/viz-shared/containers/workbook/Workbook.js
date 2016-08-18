import React from 'react'
import { Views } from '../view';
import { connect } from 'reaxtor-redux';

function Workbook({ views = [] } = {}) {
    return (
        <Views falcor={views} />
    );
}

function mapStateToFragment({ views = [] } = {}) {
    return `{
        views: ${
            Views.fragment({ views })
        }
    }`;
}

export default connect(
    mapStateToFragment
)(Workbook);
