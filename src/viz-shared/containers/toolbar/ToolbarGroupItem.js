import React from 'react'
import styles from './toolbar.less';
import classNames from 'classnames';
import { Button, Tooltip, OverlayTrigger } from 'react-bootstrap';
import { connect } from 'reaxtor-redux';

function ToolbarGroupItem({
        onItemSelected,
        id, beta, name, iFrame, selected
    } = {}) {
    return (
        <OverlayTrigger
            placement='right'
            overlay={<Tooltip id='toolbar-item-tooltip'>{name}</Tooltip>}>
            <Button
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
}

function mapStateToFragment(toolbarItem) {
    return `{
        id, beta, name, iFrame, selected
    }`;
}

export default connect(
    mapStateToFragment, null, {
    onItemSelected: (id) => (ev) => ({
        id, type: 'toolbar-item-select'
    })
})(ToolbarGroupItem);
