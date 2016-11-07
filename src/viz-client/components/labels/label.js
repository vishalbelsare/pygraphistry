import Color from 'color';
import classNames from 'classnames';
import React, { PropTypes } from 'react';
import { defaultFormat } from 'viz-shared/formatters';
import { Tooltip, OverlayTrigger } from 'react-bootstrap';
import styles from 'viz-shared/components/labels/style.less';

function preventPropagation (f) {
    return function (e) {
        e.stopPropagation();
        return f();
    }
}

export const Label = ({ showFull, pinned,
                        onFilter, onExclude,
                        onClick, onPinChange,
                        color, opacity, background,
                        type, index, title, columns, ...props }) => {

    let styleOverrides;

    if (!showFull) {
        styleOverrides = { color, opacity, background };
    }

    return (
        <div onClick={(e) => {
                 e.stopPropagation();
                 e.nativeEvent.stopImmediatePropagation();
                 onClick && onClick(e);
             }}
             onWheel={(e) => {
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
             }}
             className={classNames({
                 [styles['on']]: showFull,
                 [styles['clicked']]: pinned,
                 [styles['graph-label']]: true,
             })}
             {...props}>
            <div className={classNames({
                    [styles[`graph-label-${type}`]]: true,
                    [styles['graph-label-container']]: true,
                 })}
                 style={{ ...styleOverrides }}>
                <LabelTitle type={type}
                            title={title}
                            onExclude={onExclude}
                            onPinChange={onPinChange}/>
                <LabelContents type={type}
                               title={title}
                               columns={columns}
                               onFilter={onFilter}
                               onExclude={onExclude}/>
            </div>
        </div>
    );
};

function LabelTitle ({ type, title, onExclude, onPinChange }) {
    return (
        <div className={styles['graph-label-title']}>
            <a href="#" onClick={ preventPropagation(() => onPinChange && onPinChange({ type, title })) }>
                <i className={classNames({
                    [styles['fa']]: true,
                    [styles['pin']]: true,
                    [styles['fa-lg']]: true,
                    [styles['fa-thumb-tack']]: true,
                })}/>
            </a>
            <span className={styles['label-type']}>{ type }</span>
            <span className={styles['graph-label-title-text']}>{ title }</span>
            <OverlayTrigger trigger={['hover']}
                        placement='bottom'
                        overlay={
                            <Tooltip className={styles['label-tooltip']}
                                     id={`tooltip:title:${type}:${title}`}>
                                Exclude if title: {title}
                            </Tooltip>
                        }>
                <a className={styles['exclude-by-title']}
                    onClick={ preventPropagation(() => onExclude && onExclude({ type, field: '_title', value: title })) }>
                </a>
            </OverlayTrigger>
        </div>
    );
}

function LabelContents ({ columns = [], ...props }) {
    return (
        <div className={styles['graph-label-contents']}>
            <table>
                <tbody>
                {columns.map(({ key, ...column}) => (
                    <LabelRow field={key} {...props} {...column}/>
                ))}
                </tbody>
            </table>
        </div>
    );
}

function LabelRow ({ type, title,
                     field, value,
                     onFilter, onExclude,
                     dataType, displayName }) {

    const displayString = displayName || defaultFormat(value, dataType);

    if (displayString === null || displayString === undefined) {
        return null;
    }

    return (
        <tr className={styles['graph-label-pair']}>
            <td className={styles['graph-label-key']}>{field}</td>
            <td className={styles['graph-label-value']}>
                <div className={styles['graph-label-value-wrapper']}>

                    <span className={styles['graph-label-value-text']}>{displayString}</span>

                    { dataType ==='color' &&
                    <span className={styles['label-color-pill']}
                          style={{ backgroundColor: new Color(value).rgbString() }} />}

                    <div className={styles['graph-label-icons']} style={{display:"none"}}>
                        <OverlayTrigger trigger={['hover']}
                                        placement='bottom'
                                        overlay={
                                            <Tooltip className={styles['label-tooltip']}
                                                     id={`tooltip:row:exclude${type}:${title}:${field}`}>
                                                Exclude if "{type}:{field} = {value}"
                                            </Tooltip>
                                        }>
                            <a className={styles['exclude-by-key-value']}
                               onClick={ preventPropagation(() => onExclude && onExclude({ type, field, value }))}>
                                <i className={classNames({
                                    [styles['fa']]: true,
                                    [styles['fa-ban']]: true
                                })}/>
                            </a>
                        </OverlayTrigger>

                        <OverlayTrigger trigger={['hover']}
                                        placement='bottom'
                                        overlay={
                                            <Tooltip className={styles['label-tooltip']}
                                                     id={`tooltip:row:filter:${type}:${title}:${field}`}>
                                                Filter for "{type}:{field} = {value}"
                                            </Tooltip>
                                        }>
                            <a className={styles['filter-by-key-value']}
                               onClick={ preventPropagation(() => onFilter && onFilter({ type, field, value }))}>
                                <i className={classNames({
                                    [styles['fa']]: true,
                                    [styles['fa-filter']]: true
                                })}/>
                            </a>
                        </OverlayTrigger>
                    </div>
                </div>
            </td>
        </tr>
    );
}
