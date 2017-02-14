import React from 'react'
import styles from './styles.less';
import { connect, container } from '@graphistry/falcor-react-redux';
import { renderNothing } from 'recompose';
import { View } from 'viz-shared/containers/view';
import * as Scheduler from 'rxjs/scheduler/animationFrame';

let DevTools = renderNothing();

// if (__DEV__) {
//     DevTools = require('viz-shared/components').DevTools;
// }

let App = ({ workbooks = [], ...props } = {}) => {
    const { open: workbook = {} } = workbooks;
    const { views = [] } = workbook;
    const { current: view } = views;
    return (
        <div className={styles['app']}>
            <View key='view' data={view} />
            <DevTools key='dev-tools'/>
        </div>
    );
}

App = container({
    renderLoading: true,
    fragment: ({ workbooks = [] } = {}) => {
        const { open: workbook = {} } = workbooks;
        const { views = [] } = workbook;
        const { current: view = {} } = views;
        return `{
            workbooks: {
                length, open: {
                    id, title, views: {
                        length, current: ${
                            View.fragment(view)
                        }
                    }
                }
            }
        }`;
    }
})(App);

App = connect(App, Scheduler.animationFrame);

export { App };
