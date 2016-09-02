import React from 'react';
import { findDOMNode } from 'react-dom'
import styles from './styles.less';
import classNames from 'classnames';

import {
    Button, Tooltip, OverlayTrigger,
    ButtonGroup, ButtonToolbar,
    ListGroup, ListGroupItem
} from 'react-bootstrap';

export function ButtonList({ children, visible, ...props }) {

    if (!visible) {
        return null;
    }

    return (
        <ListGroup className={styles['button-list']} {...props}>
        {children.map((child) => (
            <ListGroupItem key={child.key} style={{
                padding: `2px 0px`,
                background: `transparent`,
                borderColor: `rgba(0,0,0,0)` }}>
                {child}
            </ListGroupItem>
        ))}
        </ListGroup>
    );
}

export function ButtonListItems({ children }) {
    return (
        <ButtonToolbar style={{ marginLeft: 0 }}>
            <ButtonGroup vertical>
                {children}
            </ButtonGroup>
        </ButtonToolbar>
    );
}

function ButtonListItemTooltip(name) {
    return (
        <Tooltip id='button-list-item-tooltip'>{name}</Tooltip>
    );
}

export function ButtonListItem({ onItemSelected, ...props }) {

    const { id, name, selected } = props;

    return (
        <OverlayTrigger placement='right'
                        overlay={ButtonListItemTooltip(name)}>
            <Button href='#'
                    active={selected}
                    onClick={(e) => e.preventDefault() || onItemSelected(props)}
                    className={classNames({
                         [styles[id]]: true,
                         [styles['fa']]: true,
                         [styles['fa-fw']]: true,
                         [styles['selected']]: selected,
                         [styles['button-list-item']]: true
                    })}
            />
        </OverlayTrigger>
    );
}
