import React, { PropTypes } from 'react';
import { Tooltip, OverlayTrigger } from 'react-bootstrap';
import {
    Subject, Observable,
    Subscription, ReplaySubject
} from 'rxjs';

import {
    compose,
    getContext,
    shallowEqual
} from 'recompose';

import _ from 'underscore';

import Color from 'color';
import {defaultFormat} from '../../streamGL/graphVizApp/contentFormatter.js';

import styles from './style.less';



const propTypes = {
    opacity: React.PropTypes.number,
    background: React.PropTypes.any,
    foreground: React.PropTypes.any,

    poiEnabled: React.PropTypes.bool,
    enabled: React.PropTypes.bool,

    onClick: React.PropTypes.func,
    onFilter: React.PropTypes.func,
    onExclude: React.PropTypes.func,
    onPinChange: React.PropTypes.func,

    hideNull: React.PropTypes.bool,
    selectedColumns: React.PropTypes.object,
    labels: React.PropTypes.array
};

const defaultProps = {
    opacity: 1,
    poiEnabled: true,
    enabled: true,
    onClick: (() => console.log('clicked')),
    onFilter: (() => console.log('click filter')),
    onExclude: (() => console.log('click exclude')),
    onPinChange: (() => console.log('click pin change')),
    hideNull: true,
    labels: [
          {
            type: 'point',
            id: 'bullwinkle',
            title: "the greatest moose",

            showFull: true, // expanded when :hover or .on
            pinned: true,

            x: 200,
            y: 30,

            fields: [
                //{key, value, ?displayName, dataType: 'color' or ?}
                {key: 'field01', value: 0},
                {key: 'field02', value: 'hello'},
                {key: 'field03', value: 'world'},
                {key: 'field04', value: 2000},
                {key: 'field05', value: '#f00', dataType: 'color'},
                {key: 'field06', value: '#ff0000', dataType: 'color'},
                {key: 'field07', value: undefined},
                {key: 'field08', value: null},
                {key: 'field09', value: 'another'},
                {key: 'field10isareallylongnameok', value: 'and another'},
                {key: 'field11 is also a really long one', value: 24},
                {key: 'field12', value: 'field value is quite long and will likely overflow'},
                {key: 'field13', value: 'fieldvalueisquitelongandwilllikelyoverflow'},
                {key: 'field14', value: 'and another'},
                {key: 'field15', value: 'and another'},
                {key: 'field16', value: 'and another'},
                {key: 'field17', value: 'and another'}
            ]
        }]
}

function LabelTitle ({onPinChange, label}) {
    const title = label.title;
    const type = label.type;
    return (
        <div className={styles['graph-label-title']}>

            <a href="#" onClick={ onPinChange.bind(null, label) }><i className={`
                ${styles['pin']}
                ${styles['fa']}
                ${styles['fa-lg']}
                ${styles['fa-thumb-tack']}`} /></a>
            <span className={styles['label-type']}>{ type }</span>

            <span className={styles['graph-label-title-text']}>{ title }</span>
            <OverlayTrigger trigger={['hover']}
                        placement='bottom'
                        overlay={<Tooltip className={styles['label-tooltip']} id={`tooltip:title:${type}:${title}`}>Exclude if title: {title}</Tooltip>}>
                <a className={styles['exclude-by-title']}>
                    <i className={`${styles['fa']} ${styles['fa-ban']}`} />
                </a>
            </OverlayTrigger>

        </div>);
}

function LabelRow ({field, value, displayName, dataType, label, onFilter, onExclude}) {
    const displayString = displayName || defaultFormat(value, dataType);
    if (displayString === null || displayString === undefined) {
        return <tr style={{display: 'none'}}/>;
    }

    return (
        <tr className={styles['graph-label-pair']}>
            <td className={styles['graph-label-key']}>
                {field}
            </td>
            <td className={styles['graph-label-value']}>
                <div className={styles['graph-label-value-wrapper']}>
                    <span className={styles['graph-label-value-text']}>{displayString}</span>
                    { dataType ==='color'
                        ? <span className={styles['label-color-pill']}
                            style={{backgroundColor: new Color(value).rgbString()}} />
                        : null}
                    <div className={styles['graph-label-icons']}>

                        <OverlayTrigger trigger={['hover']}
                            placement='bottom'
                            overlay={<Tooltip className={styles['label-tooltip']} id={`tooltip:row:exclude${label.type}:${label.title}:${field}`}>Exclude if "{label.type}:{field} = {value}"</Tooltip>}>
                            <a className={styles['exclude-by-key-value']}
                                onClick={ onExclude.bind(null, label, field, value) }>
                                <i className={`${styles['fa']} ${styles['fa-ban']}`} />
                            </a>
                        </OverlayTrigger>

                        <OverlayTrigger trigger={['hover']}
                            placement='bottom'
                            overlay={<Tooltip className={styles['label-tooltip']} id={`tooltip:row:filter:${label.type}:${label.title}:${field}`}>Filter for "{label.type}:{field} = {value}"</Tooltip>}>

                            <a className={styles['filter-by-key-value']}
                                onClick={ onFilter.bind(null, label, field, value) }>
                                <i className={`${styles['fa']} ${styles['fa-filter']}`} />
                            </a>
                        </OverlayTrigger>

                    </div>
                </div>
            </td>
        </tr>);
}

function LabelContents (props) {
    return (
        <div className={styles['graph-label-contents']}>
            <table>
                <tbody>{
                    props.label.fields
                        .sort((a, b) =>
                            a.key.toLowerCase() < b.key.toLowerCase() ? -1
                            : a.key.toLowerCase() > b.key.toLowerCase() ? 1
                            : 0)
                        .map( ({key,value,displayName,dataType}) =>
                            <LabelRow
                                field={key} value={value} displayName={displayName} dataType={dataType}
                                {...props}
                            />)
                }</tbody>
            </table>
        </div>);
}



class DataLabel extends React.Component {

    constructor(props) {
        super(props);
        console.log('label props', props);
    }

    render () {
        return (<div
            className={`
                ${styles['graph-label']}
                ${this.props.label.showFull ? styles['on'] : ''}
                ${this.props.label.pinned ? styles['clicked'] : ''}`}
            style={{ left: this.props.label.x, top: this.props.label.y }} >
            <div className={`
                ${styles['graph-label-container']}
                ${styles['graph-label-' + this.props.label.type]}`}>

                <LabelTitle { ...this.props } />

                <LabelContents { ...this.props } />

            </div>
        </div>)
    }

}

class Labels extends React.Component {

    constructor(props) {
        super(props);
        console.log('labels props', props);
    }

    render() {

        if (!this.props.enabled) return <div className={styles['labels-container']} />;

        return (
            <div className={styles['labels-container']} onClick={this.props.onClick.bind(null, this.props)}>
                {
                    this.props.labels.map( (label) => (
                        <DataLabel {...this.props} label={label} /> ))
                }
            </div>
        );
    }
}



Labels.propTypes = propTypes;
Labels.defaultProps = defaultProps;

Labels = getContext({
    renderState: PropTypes.object,
    renderingScheduler: PropTypes.object,
})(Labels);


export { Labels };
