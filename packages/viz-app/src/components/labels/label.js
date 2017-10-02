import Color from 'color';
import styles from './styles.less';
import classNames from 'classnames';
import React from 'react';
import PropTypes from 'prop-types';
import { defaultFormat } from 'viz-app/formatters';
import { Button, Tooltip, OverlayTrigger } from 'react-bootstrap';
import { ColorPill } from 'viz-app/components/color-pill/colorPill';
import { getDefaultQueryForDataType } from 'viz-app/models/expressions';

function preventPropagation (f) {
    return function (e) {
        e.stopPropagation();
        return f(e);
    }
}

function stopPropagation(e) {
    e.stopPropagation();
}

function stopPropagationIfAnchor(e) {
    const { target } = e;
    if (target && target.tagName && target.tagName.toLowerCase() === 'a') {
        e.stopPropagation();
    }
}

const events = ['onLabelSelected', 'onLabelMouseMove'];

export class Label extends React.Component {
    constructor(props, context) {
        super(props, context);
        events.forEach((eventName) => {
            this[eventName] = (event) => {
                const { props = {} } = this;
                const { [eventName]: dispatch } = props;
                if (!dispatch) {
                    return;
                }
                const { simulating,
                        type, index,
                        renderState,
                        pinned, showFull,
                        sceneSelectionType,
                        hasHighlightedLabel,
                        renderingScheduler } = props;
                const { camera } = renderState;
                dispatch({
                    event, simulating,
                    hasHighlightedLabel,
                    isOpen: showFull,
                    labelIndex: index,
                    isSelected: pinned,
                    isLabelEvent: true,
                    componentType: type,
                    renderState,
                    renderingScheduler,
                    camera: renderState.camera,
                    selectionType: sceneSelectionType,
                });
            };
        });
        this.onLabelSelected = preventPropagation(this.onLabelSelected);
    }
    componentWillUnmount() {
        events.forEach((eventName) => this[eventName] = undefined);
    }
    render() {

        let { showFull, pinned,
              color, background,
              onFilter, onExclude,
              encodings, tooltipOffsetY = 0,
              sizes, pointColors, scalingFactor, pixelRatio,
              type, index, title, columns, importantColumns, ...props } = this.props;

        if (title == null || title == '') {
            if (!showFull && !pinned) {
                return null;
            }
        }

        let pointRgb = undefined;
        let pointColor = undefined;

        pointColor = type === 'edge' ? '#ccc' : Color(pointRgb = {
            r: pointColors[index * 4 + 0] || 0,
            g: pointColors[index * 4 + 1] || 0,
            b: pointColors[index * 4 + 2] || 0
        }).alpha(1).rgbaString();

        const iconSize = type === 'edge' ? 30 :
            Math.max(5, Math.min(scalingFactor * sizes[index], 50)) / pixelRatio;

        background = showFull || pinned ? new Color(background).alpha(1).rgbaString() : background;

        const noData = Boolean(!columns || !columns.length);
        const arrowStyle = { 'borderBottomColor': background };
        const contentStyle = { color, background, maxWidth: `none` };
        const iconClass = getIconClass({ encodings, type, columns });

        return (
            <div style={props.style} className={classNames({
                     [styles['label']]: true,
                     [styles['on']]: showFull,
                     [styles['clicked']]: pinned,
                 })}>
                <PointIcon type={type}
                           iconSize={iconSize} iconClass={iconClass}
                           pointRgb={pointRgb} pointColor={pointColor}/>
                <div style={{ left: `-50%`,
                              position: `relative`,
                              marginTop: tooltipOffsetY + 1 }}
                     onMouseMove={this.onLabelMouseMove}
                     onMouseDown={!pinned && this.onLabelSelected || undefined}
                     onTouchStart={!pinned && this.onLabelSelected || undefined}
                     className={classNames({
                          'in': true,
                          'bottom': true, 'tooltip': true,
                          [styles['label-tooltip']]: true
                     })}>
                    <div style={arrowStyle} className='tooltip-arrow'/>
                    <div style={contentStyle} className='tooltip-inner'>
                        <LabelTitle type={type}
                                    color={color}
                                    title={title}
                                    iconClass={iconClass}
                                    columns={columns}
                                    pinned={pinned}
                                    showFull={showFull}
                                    onExclude={onExclude}
                                    onMouseDown={this.onLabelSelected}
                                    onTouchStart={this.onLabelSelected}/>
                        {!noData && (showFull || pinned) &&
                        <LabelContents type={type}
                                       color={color}
                                       title={title}
                                       columns={columns}
                                       importantColumns={importantColumns}
                                       onFilter={onFilter}
                                       onExclude={onExclude}/>
                        || undefined
                        }
                    </div>
                </div>
            </div>
        );
    }
}

export function isDark ({r,g,b}) {
    const lumens = 0.299 * r + 0.587 * g + 0.114 * b;
    return lumens <= 0.5 * 255;
}

function PointIcon({ iconClass, pointColor, pointRgb, iconSize, type }) {

    if (!iconClass || type !== 'point' || iconSize <= 15) {
        return null;
    }

    const c = iconSize / 50;

    return (
        <div style={{ transform: `${
                `scale3d(${c},${c},${c})`} ${
                `translate3d(-100%, 0, 0)` /* force hardware acceleration */} ${
                `perspective(0px)` /* force sub-pixel font rendering when scaled */}`
            }}
             className={ classNames({
                 [styles['point-icon-container']]: true,
                 [styles['light-color']]: !isDark(pointRgb)
            })}>
            <div className={[styles['point-icon']]}
                 style={{ backgroundColor: pointColor }}>
                <i className={classNames({
                    'fa': true,
                    'fa-fw': true,
                    [iconClass]: true})} />
            </div>
        </div>
    );
}

function Icon({ iconClass }) {

    return iconClass ?

            <span className={classNames({
                    [styles['label-title-icon-encoded']]: true
                })}>
                <i className={classNames({
                    'fa': true,
                    'fa-fw': true,
                    [iconClass]: true})} />
            </span>

        : null;
}

function getIconClass({encodings, type, columns}) {

    if (!encodings || !encodings[type] || !encodings[type].icon) {
        return undefined;
    }

    const colMaybe = columns.filter(({key}) => key === encodings[type].icon.attribute);
    const iconStr = colMaybe.length ? colMaybe[0].value : undefined;
    if (!iconStr || !String(iconStr).match(/^[a-zA-Z0-9-]*$/)) {
        return undefined;
    }

    return `fa-${iconStr}`;
}

function LabelTitle ({ type, color, iconClass, title, icon, pinned, showFull, onExclude, onMouseDown, onTouchStart }) {

    const titleHTML = { __html: title };
    const titleExcludeHTML = { __html: title };

    if (title == null || title === '') {
        title = '';
        titleHTML.__html = '&nbsp;';
        titleExcludeHTML.__html = `''`;
    }

    if (!showFull) {
        return (
            <div className={styles['label-title']}
                 onMouseDown={onMouseDown}
                 onTouchStart={onTouchStart}>
                <span onMouseDown={stopPropagationIfAnchor}
                      className={styles['label-title-text']}>
                      <Icon iconClass={iconClass}/>
                      <span dangerouslySetInnerHTML={titleHTML}/>
                </span>
            </div>
        );
    }

    return (
        <div onMouseDown={onMouseDown}
             onTouchStart={onTouchStart}
             className={styles['label-title']}>
            <a className={classNames({
                   [styles['pinned']]: pinned,
                   [styles['label-title-close']]: true,
               })}>
                <i style={{color}} className={classNames({
                    'fa': true,
                    'fa-times': true,
                })}/>
            </a>
            <span className={styles['label-type']}>{ type }</span>
            <OverlayTrigger trigger={['hover']}
                            placement='bottom'
                            overlay={
                                <Tooltip className={styles['label-tooltip']}
                                         id={`tooltip:title:${type}:${title}`}>
                                    Exclude if "{type}:_title = {
                                        <span dangerouslySetInnerHTML={titleExcludeHTML}/>
                                    }"
                                </Tooltip>
                            }>
                <a style={{ color, float: `right`, fontSize: `.9em` }}
                   className={classNames({
                       [styles['pinned']]: pinned,
                       [styles['label-title-close']]: true,
                   })}
                   onMouseDown={stopPropagation}
                   onClick={ preventPropagation(() => onExclude && onExclude({
                            value: title,
                            name: '_title',
                            dataType: 'equals',
                            componentType: type
                        }))}>
                    <i className={classNames({
                        'fa': true,
                        'fa-ban': true
                    })}/>
                </a>
            </OverlayTrigger>
            <span onMouseDown={stopPropagationIfAnchor}
                  className={styles['label-title-text']}>
                  <Icon iconClass={iconClass}/>
                  <span dangerouslySetInnerHTML={titleHTML}
                        style={pinned && { display: 'inline-block' } || undefined}/>
            </span>
        </div>
    );
}

function LabelContents ({ columns = [], importantColumns = [], title = '', ...props }) {
    return (
        <div onMouseDown={stopPropagation}
             className={styles['label-contents']}>
            <table>
                <tbody>
                {importantColumns.map(({ key, ...column }, index) => (
                    <LabelRow key={`${index}-${title}-important`}
                              field={key} title={title} important={true}
                              {...props} {...column} />
                ))}
                {
                    (importantColumns.length < 1) ? undefined :
                        (<tr key={"label-important-separator"} className={styles['important-separator']}><td></td><td></td></tr>)
                }
                {columns.map(({ key, ...column }, index) => (
                    <LabelRow key={`${index}-${title}`}
                              field={key} title={title}
                              {...props} {...column}/>
                ))}
                </tbody>
            </table>
        </div>
    );
}

const operatorForColumn = function(operators) {
    return (queryType, dataType) => {
        return operators[queryType + '_' + dataType] || (
            operators[queryType + '_' + dataType] = getDefaultQueryForDataType({
                queryType, dataType
            }).ast.operator || '=');
    }
}({});

function LabelRow ({ color,
                     title, type,
                     field, value,
                     onFilter, onExclude,
                     important,
                     dataType, displayName }) {

    const filterOp = operatorForColumn('filter', dataType);
    const excludeOp = operatorForColumn('exclusion', dataType);
    const displayString = displayName || defaultFormat(value, dataType);

    if (displayString === null || displayString === undefined) {
        return null;
    }

    return (
        <tr className={styles['label-pair']}>
            <td className={important ? styles['label-key-important'] : styles['label-key']}>{field}</td>
            <td className={important ? styles['label-value-important'] : styles['label-value']}>
                <div className={styles['label-value-wrapper']}>

                    <span onMouseDown={stopPropagationIfAnchor}
                          className={styles['label-value-text']}>
                          <span dangerouslySetInnerHTML={{ __html: displayString }}/>
                          { dataType ==='color' && <ColorPill color={value} /> }
                    </span>

                    <div className={styles['label-icons']}>
                        <OverlayTrigger trigger={['hover']}
                                        placement='bottom'
                                        overlay={
                                            <Tooltip className={styles['label-tooltip']}
                                                     id={`tooltip:row:exclude${type}:${title}:${field}`}>
                                                Exclude if "{type}:{field} {filterOp} {
                                                    <span dangerouslySetInnerHTML={{ __html: value }}/>
                                                }"
                                            </Tooltip>
                                        }>
                            <a className={styles['exclude-by-key-value']}
                               onMouseDown={stopPropagation}
                               onClick={ preventPropagation(() => onExclude && onExclude({
                                        componentType: type, name: field, dataType, value
                                    }))}>
                                <i className={classNames({
                                    'fa': true,
                                    'fa-ban': true
                                })}/>
                            </a>
                        </OverlayTrigger>

                        <OverlayTrigger trigger={['hover']}
                                        placement='bottom'
                                        overlay={
                                            <Tooltip className={styles['label-tooltip']}
                                                     id={`tooltip:row:filter:${type}:${title}:${field}`}>
                                                Filter for "{type}:{field} {excludeOp} {
                                                    <span dangerouslySetInnerHTML={{ __html: value }}/>
                                                }"
                                            </Tooltip>
                                        }>
                            <a className={styles['filter-by-key-value']}
                               onMouseDown={stopPropagation}
                               onClick={ preventPropagation(() => onFilter && onFilter({
                                        componentType: type, name: field, dataType, value
                                    }))}>
                                <i className={classNames({
                                    'fa': true,
                                    'fa-filter': true
                                })}/>
                            </a>
                        </OverlayTrigger>
                    </div>
                </div>
            </td>
        </tr>
    );
}
