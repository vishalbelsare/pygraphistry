import React from 'react'
import View from './View';
import { connect } from 'reaxtor-redux';

function Views({ current = [] } = {}) {
    return (
        <View falcor={current}/>
    );
}

function mapStateToFragment({ views = [] } = {}) {
    return `{
        length, current: ${
            View.fragment(views.current)
        }
    }`;
}

export default connect(
    mapStateToFragment
)(Views);

