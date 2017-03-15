import React from 'react';
import ReactDOM from 'react-dom';
import styles from './styles.less';
import classNames from 'classnames';

import {
    Button, ButtonGroup, Overlay,
    Tooltip, Popover, OverlayTrigger,
} from 'react-bootstrap';

export function ButtonList({ children, visible, ...props }) {

    if (!visible) {
        return null;
    }

    return (
        <ul className={`dropdown-menu open ${styles['button-list']}`} {...props}>
            {children}
        </ul>
    );
}

export function ButtonListItems({ name, popover, children, ...props }) {
    return (
        <li>
            <span className='dropdown-header' style={{display: `inline`}}>
                {name}
            </span>
            <ButtonGroup>
                {children}
            </ButtonGroup>
        </li>
    );
}

function ButtonListItemTooltip(name) {
    return (
        <Tooltip id='button-list-item-tooltip'>{name}</Tooltip>
    );
}

export function ButtonListItem({ onItemSelected, popover, ...props }) {

    let buttonRef;
    const { id, name, type, selected } = props;
    const button = (
        <Button id={id} href='#'
                active={selected}
                ref={(ref) => buttonRef = ref}
                onClick={(e) => e.preventDefault() || onItemSelected(props)}
                className={classNames({
                     [styles[id]]: true,
                     fa: true,
                     // 'fa-fw': true,
                     [styles['selected']]: selected,
                     [styles['button-list-item']]: true
                })}
        />
    );

    let buttonWithOverlay;

    if (type !== 'settings' || !selected) {
        buttonWithOverlay = (
            <span className={styles['button-list-item-container']}>
                <OverlayTrigger trigger={['hover']} placement='bottom'
                                overlay={ButtonListItemTooltip(name)}>
                    {button}
                </OverlayTrigger>
            </span>
        );
    } else {
        buttonWithOverlay = (
            <span className={styles['button-list-item-container']}>
                {button}
                <Overlay show={selected}
                         animation={false} placement='bottom'
                         target={() => ReactDOM.findDOMNode(buttonRef)}>
                    {popover}
                </Overlay>
            </span>
        );
    }

    return buttonWithOverlay;
    // return (
    //     <span style={{ float: `left` }}>
    //         {buttonWithHover}
    //         <Overlay show={selected}
    //                  animation={false} placement='bottom'
    //                  target={() => ReactDOM.findDOMNode(buttonRef)}>
    //             {popover}
    //         </Overlay>
    //     </span>
    // );
}
