import React from 'react'
import styles from './styles.less';
import { Toolbar } from '../toolbar';
import { Filters } from '../filters';
import { Settings } from '../settings';
import { connect } from 'reaxtor-redux';
import { Affix } from 'react-overlays';
import { renderNothing } from 'recompose';
import { AppFragment, ViewFragment } from './fragments';
import { PanelGroup, Panel, Fade, Grid, Row, Col } from 'react-bootstrap';
import DevToolsComponent from './DevTools';

let DevTools = renderNothing();

if (__DEV__) {
    DevTools = DevToolsComponent;
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
        <div className={styles['app']}>{view ?
            <View falcor={view} />
            : null}
            <DevTools/>
            <div className={styles['logo-container']}>
                <img src='img/logo_white_horiz.png' />
                <div className={styles['logo-version']}>
                    {`${new Date(date).toLocaleString()}`}
                </div>
            </div>
        </div>
    );
});

const PanelComponents = {
    filters: Filters,
    settings: Settings
}

export const View = connect(
     ViewFragment
)((props = {}) => {

    const panels = {};
    const { title = '', openPanel = '',
            toolbar, filters, settings } = props;

    filters.open = openPanel === filters.name;
    settings.open = openPanel === settings.name;

    if (openPanel) {
        const PanelData = props[openPanel];
        const PanelComponent = PanelComponents[openPanel];
        panels[openPanel] = <PanelComponent falcor={PanelData}/>;
    }

    return (
        <div>
            <Affix>
                <Toolbar falcor={toolbar} panels={panels}/>
            </Affix>
        </div>
    );
});
