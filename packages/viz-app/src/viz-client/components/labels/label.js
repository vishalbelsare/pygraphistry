import Color from 'color';
import classNames from 'classnames';
import React, { PropTypes } from 'react';
import { defaultFormat } from 'viz-shared/formatters';
import styles from 'viz-shared/components/labels/style.less';
import { Button, Tooltip, OverlayTrigger } from 'react-bootstrap';
import { ColorPill } from 'viz-shared/components/color-pill/colorPill';
import { getDefaultQueryForDataType } from 'viz-shared/models/expressions';

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

const events = [
    'onLabelSelected',
    'onLabelMouseMove',
];

export class Label extends React.Component {

    static contextTypes = {
        sizes: React.PropTypes.object.isRequired,
        colors: React.PropTypes.object.isRequired
    }


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
              encodings,
              type, title, columns, ...props } = this.props;

        if (title == null || title == '') {
            if (!showFull && !pinned) {
                return null;
            }
        }

        background = showFull || pinned ? new Color(background).alpha(1).rgbaString() : background;

        const arrowStyle = { 'border-bottom-color': background };
        const contentStyle = { color, background, maxWidth: `none` };
        const iconClass = getIconClass({ encodings, type, columns });

        return (
            <div className={classNames({
                     [styles['label']]: true,
                     [styles['on']]: showFull,
                     [styles['clicked']]: pinned,
                 })}
                 {...props}>
                <div onMouseMove={this.onLabelMouseMove}
                     onMouseDown={!pinned && this.onLabelSelected || undefined}
                     onTouchStart={!pinned && this.onLabelSelected || undefined}
                     style={{
                         left: `-50%`,
                         opacity: 1,
                         marginTop: 1,
                         position: `relative`                         
                     }}
                     className={classNames({
                          'in': true,
                          'bottom': true, 'tooltip': true,
                          [styles['label-tooltip']]: true
                     })}>
                    <PointIcon iconClass={iconClass} />
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
                        {(showFull || pinned) &&
                        <LabelContents type={type}
                                       color={color}
                                       title={title}
                                       columns={columns}
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

function PointIcon({ iconClass }) {
    return iconClass ? 
            <div className={classNames({[styles['point-icon-container']]: true})}>
                <div className={classNames({[styles['point-icon']]: true})}>                                
                    <i className={classNames({
                        'fa': true,
                        'fa-fw': true,
                        [iconClass]: true})} />
                </div>
            </div>
        : null;

}

function Icon({ iconClass }) {

    return iconClass ?

            <span className={classNames({
                    'fa-stack': true,
                    //'fa-lg': true,
                    [styles['label-title-icon-encoded']]: true
                })}>
                <i className={classNames({
                    'fa': true,
                    'fa-stack-2x': true,
                    //'fa-lg': true,
                    'fa-circle': true})}/>
                <i className={classNames({
                    'fa': true,
                    'fa-stack-1x': true,
                    //'fa-lg': true,
                    'fa-inverse': true,
                    [iconClass]: true})} />
            </span>

        : <span style={ {display: 'none'} } />;
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
                      {/*<Icon iconClass={iconClass}/>*/}
                      <span dangerouslySetInnerHTML={titleHTML} style={ {display: 'inline-block'} }/>
                </span>
            </div>
        );
    }

    return (
        <div onMouseDown={onMouseDown}
             onTouchStart={onTouchStart}
             className={styles['label-title']}>
            <a href='javascript:void(0)'
               className={classNames({
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
                <a href='javascript:void(0)'
                   style={{ color, float: `right`, fontSize: `.9em` }}
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
                  {/*<Icon iconClass={iconClass}/>*/}
                  <span dangerouslySetInnerHTML={titleHTML} style={ {display: 'inline-block'} }/>
            </span>
        </div>
    );
}

function LabelContents ({ columns = [], title = '', ...props }) {
    return (
        <div onMouseDown={stopPropagation}
             className={styles['label-contents']}>
            <table>
                <tbody>
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
                     dataType, displayName }) {

    const filterOp = operatorForColumn('filter', dataType);
    const excludeOp = operatorForColumn('exclusion', dataType);
    const displayString = displayName || defaultFormat(value, dataType);

    if (displayString === null || displayString === undefined) {
        return null;
    }

    return (
        <tr className={styles['label-pair']}>
            <td className={styles['label-key']}>{field}</td>
            <td className={styles['label-value']}>
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
