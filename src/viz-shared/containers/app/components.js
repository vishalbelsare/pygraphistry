import React from 'react'
import styles from './styles.less';
import { connect } from 'reaxtor-redux';
import { renderNothing } from 'recompose';
import { AppFragment } from './fragments';
import { View } from 'viz-shared/containers/view';

let DevTools = renderNothing();

if (__DEV__) {
    DevTools = require('viz-shared/components').DevTools;
}

export const App = connect(
    AppFragment
)(({ release = {}, workbooks = [], ...props } = {}) => {
    const { open: workbook = {} } = workbooks;
    const { views = [] } = workbook;
    const { current: view } = views;
    const { current = {} } = release;
    const { date = Date.now() } = current;
    return (
        <div className={styles['app']}>
            <div className={styles['logo-container']}>
                <img src='img/logo_white_horiz.png' />
                <div className={styles['logo-version']}>
                    {`${new Date(date).toLocaleString()}`}
                </div>
            </div>
            {view ? <View key='view' falcor={view} /> : null}
            <DevTools/>
        </div>
    );
});
