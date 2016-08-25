import React from 'react'
import styles from './styles.less';
import classNames from 'classnames';
import { container } from 'reaxtor-redux';
import { FiltersFragment, FilterFragment } from './fragments';
import {
    Button, Panel,
    Tooltip, OverlayTrigger,
    ListGroup, ListGroupItem
} from 'react-bootstrap';

// import ToggleButton from 'react-bootstrap-switch';

const filterExpressionTooltip = (
    <Tooltip id='filter-expression-tooltip'>Filter Expression</Tooltip>
);

const expressionEnabledTooltip = (
    <Tooltip id='expression-enabled-tooltip'>Enabled</Tooltip>
);

const deleteExpressionTooltip = (
    <Tooltip id='delete-expression-tooltip'>Delete Expression</Tooltip>
);

export const Filters = container(
     FiltersFragment, (filters) => ({
     filters, name: filters.name, open: filters.open })
)(({ filters = [], name = '', open = false, style }) => {
    return (
        <ListGroup>
        {filters.map((filter) => [
            <ListGroupItem key={filter.key}>
                <Filter data={filter}/>
            </ListGroupItem>
        ])}
        </ListGroup>
    );
});

export const Filter = container(
    FilterFragment
)(({ id, title, attribute, level, query }) => {
    return (
        <div>
            <OverlayTrigger
                placement='top'
                overlay={filterExpressionTooltip}>
                <textarea defaultValue={query.inputString}/>
            </OverlayTrigger>
            {level === 'system' ?
            <div>
                <OverlayTrigger placement='top'
                                overlay={expressionEnabledTooltip}>
                    <ToggleButton onText='Enabled' offText='Disabled'/>
                </OverlayTrigger>
                <OverlayTrigger placement='right'
                                overlay={deleteExpressionTooltip}>
                    <Button href='javascript:void(0)' className={classNames({
                        [styles['fa']]: true,
                        [styles['fa-close']]: true
                    })}/>
                </OverlayTrigger>
            </div>
            : null}
        </div>
    );
});
