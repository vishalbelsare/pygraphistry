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

function stopPropagation(e) {
    // e.nativeEvent.stopImmediatePropagation();
    e.stopPropagation();
}

export class Label extends React.Component {
    constructor(props, context) {
        super(props, context);
        this._onTouchStart = (event) => {
            const { props = {} } = this;
            const { onTouchStart } = props;
            if (!onTouchStart) {
                return;
            }
            event.stopPropagation();
            const { simulating,
                    type, index,
                    pinned, showFull,
                    sceneSelectionType } = props;
            onTouchStart({
                event,
                simulating,
                isOpen: showFull,
                labelIndex: index,
                isSelected: pinned,
                isLabelEvent: true,
                componentType: type,
                selectionType: sceneSelectionType
            });
        };
    }
    render() {

        const { showFull, pinned,
                color, opacity, background,
                onFilter, onExclude, onPinChange,
                type, index, title, columns, ...props } = this.props;

        const arrowStyle = !showFull && { 'border-bottom-color': background } || undefined;
        const contentStyle = !showFull && { color, opacity, background } || undefined;

        return (
            <div onMouseDown={this._onTouchStart}
                 onTouchStart={this._onTouchStart}
                 className={classNames({
                     [styles['on']]: showFull,
                     [styles['clicked']]: pinned,
                     [styles['graph-label']]: true,
                 })}
                 {...props}>
                <div className={classNames({
                          'in': true,
                          'bottom': true,
                          'tooltip': true,
                     })}
                     style={{ position: `relative`, left: `-50%` }}>
                    <div className='tooltip-arrow' style={arrowStyle}/>
                    <div className={classNames({
                            'tooltip-inner': true,
                            [styles[`graph-label-${type}`]]: true,
                            [styles['graph-label-container']]: true,
                         })}
                         style={contentStyle}>
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
            </div>
        );
        /*
        return (
            <div onMouseDown={this._onTouchStart}
                 onTouchStart={this._onTouchStart}
                 className={classNames({
                     [styles['on']]: showFull,
                     [styles['clicked']]: pinned,
                     [styles['graph-label']]: true,
                 })}
                 {...props}>
                <Tooltip id={`${type}-${index}-label`}
                         className='in'
                         placement='bottom'
                         style={{ position: `relative`, left: `-50%` }}>
                {!showFull && !pinned &&
                    <div style={styleOverrides}>{title}</div> ||
                    <div style={styleOverrides}>
                        <span>{type} {title}</span>
                        <LabelContents type={type}
                                       title={title}
                                       columns={columns}
                                       onFilter={onFilter}
                                       onExclude={onExclude}/>
                    </div>
                }
                </Tooltip>
            </div>
        );
        */
    }
}

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
                {columns.map(({ key, title, ...column }, index) => (
                    <LabelRow key={`${index}-${title}`}
                              field={key} title={title}
                              {...props} {...column}/>
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
