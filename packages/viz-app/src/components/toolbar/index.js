import React from 'react';
import ReactDOM from 'react-dom';
import styles from './styles.less';
import classNames from 'classnames';

import {
    Overlay,
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

export function ButtonListItems({ name, children, popover, ...props }) {
    return (
        <ButtonToolbar style={{ marginLeft: 0 }} {...props}>
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

export function ButtonListItem({ onItemSelected, popover, ...props }) {

    let overlayRef, buttonWithOverlay;
    const { id, name, type, selected } = props;

    if (type === undefined || !selected) {
        buttonWithOverlay = (
            <OverlayTrigger defaultOverlayShown={false}
                            trigger={['hover']} placement='right'
                            overlay={ButtonListItemTooltip(name)}>
                <Button id={id}
                        active={selected}
                        href='javascript:void(0)'
                        onClick={(e) => e.preventDefault() || onItemSelected(props)}
                        className={classNames({
                             [styles[id]]: true,
                             fa: true,
                             'fa-fw': true,
                             [styles['selected']]: selected,
                             [styles['button-list-item']]: true
                        })}>
                    <span ref={(ref) => overlayRef = ref}/>
                </Button>
            </OverlayTrigger>
        );
    } else {
        buttonWithOverlay = (
            <Button id={id}
                    active={selected}
                    href='javascript:void(0)'
                    onClick={(e) => e.preventDefault() || onItemSelected(props)}
                    className={classNames({
                         [styles[id]]: true,
                         fa: true,
                         'fa-fw': true,
                         [styles['selected']]: selected,
                         [styles['button-list-item']]: true
                    })}>
                <span ref={(ref) => overlayRef = ref}/>
                <Overlay show={selected}
                         rootClose={true}
                         shouldUpdatePosition={true}
                         animation={true} placement='right'
                         onHide={() => onItemSelected(props)}
                         target={() => ReactDOM.findDOMNode(overlayRef)}>
                    {popover}
                </Overlay>
            </Button>
        );
    }

    return buttonWithOverlay;
}
