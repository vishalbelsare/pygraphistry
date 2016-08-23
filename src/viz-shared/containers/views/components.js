import React from 'react'
import classNames from 'classnames';
import { connect } from 'reaxtor-redux';
import { ViewFragment } from './fragments';

import { Toolbar } from 'viz-shared/containers/toolbar';

export const View = connect(
     ViewFragment
)(({ toolbar }) => {
    return (
        <div className={styles['view']}>
            <Toolbar falcor={toolbar}/>
        </div>
    )
});

/*
import { Accordion, Panel, Tabs, Tab } from 'react-bootstrap';
import { Sets } from '../sets';
import { Scene } from '../scene';
import { Filters } from '../filters';
import { Timebar } from '../timebar';
import { Toolbar } from '../toolbar';
import { Settings } from '../settings';
import { Inspector } from '../inspector';
import { Exclusions } from '../exclusions';
import { Histograms } from '../histograms';

export const View = connect(
     ViewFragment
)(({ title = '', sets, scene,
     timebar, toolbar, filters, settings,
     inspector, exclusions, histograms } = {}) => {

    const isRightPanelOpen = histograms.open;
    const isBottomPanelOpen = timebar.open || inspector.open;
    const isLeftPanelOpen = sets.open || filters.open || settings.open || exclusions.open;

    return (
        <div className={styles['view']}>
            {scene ?
            <Scene falcor={scene}/> : null}
            <DockingPanel side='left' isOpen={isLeftPanelOpen} isRelatedOpen={isBottomPanelOpen}>
                { sets.open ?
                <Panel collapsible expanded={sets.open} header={sets.name}>
                    <Sets fill falcor={sets}/>
                </Panel> : null }
                { filters.open ?
                <Panel collapsible expanded={filters.open} header={filters.name}>
                    <Filters fill falcor={filters}/>
                </Panel> : null }
                { settings.open ?
                <Panel collapsible expanded={settings.open} header={settings.name}>
                    <Settings fill falcor={settings}/>
                </Panel> : null }
                { exclusions.open ?
                <Panel collapsible expanded={exclusions.open} header={exclusions.name}>
                    <Exclusions fill falcor={exclusions}/>
                </Panel> : null }
            </DockingPanel>
            <DockingPanel side='right' isOpen={isRightPanelOpen}>
                <Histograms falcor={histograms}/>
            </DockingPanel>
            <DockingPanel side='bottom' isOpen={isBottomPanelOpen} isRelatedOpen={isRightPanelOpen}>
                {inspector.open && timebar.open ?
                    <Tabs animation={false} defaultActiveKey={1}>
                        <Tab eventKey={1} title={inspector.name}>
                            <Inspector falcor={inspector}/>
                        </Tab>
                        <Tab eventKey={2} title={timebar.name}>
                            <Timebar falcor={timebar}/>
                        </Tab>
                    </Tabs>
                : inspector.open ?
                    <Inspector falcor={inspector}/>
                : timebar.open ?
                    <Timebar falcor={timebar}/>
                : null }
            </DockingPanel>
            <Toolbar falcor={toolbar}/>
        </div>
    );
});

function DockingPanel({ isOpen, isRelatedOpen, side, children = [] } = {}) {

    const style = { ...panelStateStyles(isOpen) };

    if (side === 'left') {
        style.height = isRelatedOpen && toPercent(1/Math.sqrt(2)) || `100%`,
        style.transform = `translate3d(${Number(!isOpen) * -10}%, 0, 0)`;
    } else if (side === 'right') {
        style.transform = `translate3d(${Number(!isOpen) * 10}%, 0, 0)`;
    } else if (side === 'bottom') {
        style.right = isRelatedOpen && `10em` || 0,
        style.transform = `translate3d(0, ${Number(!isOpen) * 10}%, 0)`;
    }

    return (
        <div style={style} className={classNames({
            [styles[side]]: true,
            [styles['dock-panel']]: true
        })}>
        {children}
        </div>
    );
}

function panelStateStyles(isOpen) {
    return {
        opacity: Number(isOpen),
        visibility: isOpen && 'visible' || 'hidden',
        transition: isOpen &&
            `opacity 0.2s, transform 0.2s, visibility 0s` ||
            `opacity 0.2s, transform 0.2s, visibility 0s linear 0.2s`
    };
}

function toPercent(float) {
    return `${Math.floor(float * 100000) / 1000}%`;
}
*/
