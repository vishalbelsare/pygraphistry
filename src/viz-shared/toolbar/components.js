import React from 'react'
import styles from './styles.less';
import classNames from 'classnames';
import { connect } from 'reaxtor-redux';
import { selectToolbarItem } from './actions';
import { renderNothing } from 'recompose';
import {
    ToolbarFragment,
    ToolbarGroupFragment,
    ToolbarGroupItemFragment
} from './fragments';

import {
    Button, Tooltip, OverlayTrigger,
    ButtonGroup, ButtonToolbar,
    ListGroup, ListGroupItem,
    Popover
} from 'react-bootstrap';

import { Filters } from '../filters';
import { Settings } from '../settings';

export const Toolbar = connect(
     ToolbarFragment, (toolbar) => ({
     toolbar, visible: toolbar.visible })
)(({ toolbar, visible, panels }) => {

    if (!visible) {
        return null;
    }

    return (
        <ListGroup className={styles['toolbar']}>
        {toolbar.map((group) => (
            <ListGroupItem key={group.key} style={{
                padding: `2px 0px`,
                background: `transparent`,
                borderColor: `rgba(0,0,0,0)` }}>
                <ToolbarGroup falcor={group} panels={panels}/>
            </ListGroupItem>
        ))}
        </ListGroup>
    );
});

export const ToolbarGroup = connect(
     ToolbarGroupFragment, (tools) => ({
     tools, name: tools.name })
)(({ tools, name, panels }) => {
    return (
        <ButtonToolbar style={{ marginLeft: 0 }}>
            <ButtonGroup vertical>
            {tools.map((tool) => (
                <ToolbarGroupItem falcor={tool}
                                  panels={panels}
                                  key={tool.key} />
            ))}
            </ButtonGroup>
        </ButtonToolbar>
    )
});

const toolbarGroupItemPanel = (PanelName, PanelComponent) => (
    <Popover id='open-panel-container' title={PanelName} key={PanelName}>
        {PanelComponent}
    </Popover>
);

const toolbarGroupItemTooltip = (name) => (
    <Tooltip id='toolbar-item-tooltip'>{name}</Tooltip>
);

export const ToolbarGroupItem = connect(
     ToolbarGroupItemFragment, null, {
     onItemSelected: selectToolbarItem }
)(({ onItemSelected, panel = '', panels = {},
     id, beta, name, iFrame, selected }) => {

    let overlay, trigger;
    const isPanelOpen = panel && panel in panels || false;

    if (isPanelOpen) {
        const PanelName = `${panel.charAt(0).toUpperCase()}${panel.substring(1)}`;
        const PanelComponent = panels[panel];
        trigger = 'click';
        overlay = toolbarGroupItemPanel(PanelName, PanelComponent);
    } else {
        trigger = ['hover', 'focus'];
        overlay = toolbarGroupItemTooltip(name);
    }

    return (
        <OverlayTrigger placement='right' overlay={overlay}
                        trigger={trigger} defaultOverlayShown={isPanelOpen}>
            <Button
               active={selected && isPanelOpen}
               href='javascript:void(0)'
               onClick={onItemSelected}
               className={classNames({
                    [styles[id]]: true,
                    [styles['fa']]: true,
                    [styles['fa-fw']]: true,
                    [styles['toolbar-item']]: true
               })}
            />
        </OverlayTrigger>
    );
});
