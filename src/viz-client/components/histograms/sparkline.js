import React from 'react';
import { Button, Tooltip, Popover, OverlayTrigger } from 'react-bootstrap';
import classNames from 'classnames';
import _ from 'underscore';

import styles from 'viz-shared/components/histograms/styles.less';
import stylesGlobal from 'viz-shared/index.less';

import EncodingPicker from './EncodingPicker.js';
import { defaultFormat, shortFormat } from './contentFormatter.js';


const WIDTH = 298 - 20; //anything less than the panel width
const HEIGHT = 50;
const MAX_BIN_WIDTH = 60;
const MIN_BIN_HEIGHT_NONEMPTY = 5;


const propTypes = {
    sizeValue: React.PropTypes.Array,
    colorValue: React.PropTypes.Array,
    showModal: React.PropTypes.bool,
    yAxisValue: React.PropTypes.string,

    onColorChange: React.PropTypes.func,
    onSizeChange: React.PropTypes.func,
    onModalChange: React.PropTypes.func.isRequired,
    onYAxisChange: React.PropTypes.func,

    global: React.PropTypes.object,
    masked: React.PropTypes.object,
    attribute: React.PropTypes.string.isRequired,
    type: React.PropTypes.string.isRequired
};

const defaultProps = {
    sizeValue: [],
    colorValue: [],
    showModal: false,
    yAxisValue: 'none'
};

function formRow(label, entry) {
    return (
        <div style={{whiteSpace: 'nowrap'}}>
            <span style={{display: 'inline-block', width: '70px', textAlign: 'right'}}>
                {label}
            </span>
            <label style={{marginLeft: '10px'}}>{entry}</label>
        </div>);
}

function computeBinMax (rawBins, numBins) {
    const bins = rawBins instanceof Array ?
        rawBins
        : Array.prototype.slice.call(_.extend({}, {length: numBins}, rawBins));
    return Math.max.apply(null, bins);
}

function binToColumn(
    {numBins, binMax, binWidth, leftOffset, dataType, yAxisValue},
    {attribute, binIdx, globalCount, maskCount, binValue}) {

    const trans = ({
        'undefined': _.identity,
        'none': _.identity,
        'log': Math.log,
        'log2': Math.log2,
        'log10': Math.log10
    })[yAxisValue];

    const globalHeightCalc =
        globalCount ?
            Math.max(HEIGHT * trans(globalCount) / (trans(binMax) || 1), MIN_BIN_HEIGHT_NONEMPTY)
            : 0;
    const maskHeightCalc =
        maskCount ?
            Math.max(HEIGHT * trans(maskCount) / (trans(binMax) || 1), MIN_BIN_HEIGHT_NONEMPTY)
            : 0;

    return (
        <OverlayTrigger trigger={['hover']}
            placement='bottom'
            overlay={
                <Popover id={`tooltip-histogram-${attribute}-col-${binIdx}`} style={{zIndex: 999999999}}>
                    { formRow('COUNT', globalCount)}
                    { maskCount ?
                        formRow(
                            <span style={{color: '#0fa5c5'}}>SELECTED</span>,
                            <span style={{color: '#0fa5c5'}}>{maskCount}</span>)
                        : undefined }
                    {
                        !binValue ? undefined
                        : binValue.isSingular ? formRow('VALUE', binValue.representative)
                        : formRow(
                            'RANGE',
                            `${shortFormat(binValue.min, dataType)} : ${shortFormat(binValue.max, dataType)}`)
                    }
                </Popover>
            }>
            <div className={styles['histogram-column']}
                data-binmax={binMax}
                style={{
                    left: `${leftOffset + binIdx * binWidth}px`,
                    width: `${binWidth}px`
                }}>
               <div className={`${styles['bar-global']} ${styles['bar-rect']}`}
                data-count={globalCount}
                style={{
                    width: `${binWidth}px`,
                    height: `${globalHeightCalc}px`,
                    top: `${HEIGHT - globalHeightCalc}`,
                    visibility: globalCount ? 'visible' : 'hidden'
                }} />
               <div className={`${styles['bar-masked']} ${styles['bar-rect']}`}
               data-count={maskCount}
                style={{
                    width: `${binWidth}px`,
                    height: `${maskHeightCalc}px`,
                    top: `${HEIGHT - maskHeightCalc}px`,
                    visibility: maskCount ? 'visible' : 'hidden'
                }} />
            </div>
        </OverlayTrigger>);

}



export class Sparkline extends React.Component {
    constructor(props, context) {
        super(props, context);
        this.handleSizeChange = this.handleSizeChange.bind(this);
        this.handleColorChange = this.handleColorChange.bind(this);
        this.handleModalChange = this.handleModalChange.bind(this);
        this.handleYAxisChange = this.handleYAxisChange.bind(this);
        this.state = {
            sizeValue: this.props.sizeValue,
            colorValue: this.props.colorValue,
            showModal: this.props.showModal,
            yAxisValue: this.props.yAxisValue
        }
    }

    handleSizeChange (sizeValue) {
        this.setState({sizeValue});
        if (this.props.onSizeChange) {
            this.props.onSizeChange(sizeValue);
        }
    }
    handleColorChange (colorValue) {
        this.setState({colorValue});
        if (this.props.onColorChange) {
            this.props.onColorChange(colorValue);
        }
    }

    handleModalChange (showModal) {
        this.setState({showModal});
        if (this.props.onModalChange) {
            this.props.onModalChange(showModal);
        }
    }

    handleYAxisChange (yAxisValue) {
        this.setState({yAxisValue});
        if (this.props.onYAxisChange) {
            this.props.onYAxisChange(yAxisValue);
        }
    }

    render() {

        let { global: _global = {},
              masked: _masked = {},
              type, attribute } = this.props;

        let summary = {
            numBins: _global.numBins,
            binMax: computeBinMax(_global.bins, _global.numBins),
            binWidth: Math.min(Math.round(WIDTH / (_global.numBins || 1)), MAX_BIN_WIDTH),
            dataType: _global.dataType,
            leftOffset: 0,
            yAxisValue: this.state.yAxisValue
        };
        summary.leftOffset = Math.floor((WIDTH - summary.binWidth * summary.numBins) / 2);
        Object.freeze(summary);

        return (
            <div className={styles['histogram']}>

                <div className={styles['histogram-title']}>

                    <div className={styles['histogram-icons']}>
                        { this.state.sizeValue && this.state.sizeValue.length
                                ?  <span class="label label-default">
                                        <Button bsSize="small"
                                            className={styles['histogram-legend-pill']}>
                                            <span className={classNames({
                                                [stylesGlobal['fa']]: true,
                                                [stylesGlobal['fa-dot-circle-o']]: true,
                                                [styles['histogram-size-encoding-icon']]: true
                                            })}/>
                                            Size
                                        </Button>
                                    </span>
                                : null }
                        { this.state.yAxisValue !== 'none'
                                ?   <span class="label label-default">
                                        <Button bsSize="small"
                                            className={styles['histogram-legend-pill']}>
                                            Y-Axis: {this.state.yAxisValue}
                                        </Button>
                                    </span>
                                : null
                        }
                        <EncodingPicker
                            id={`histogram-encodings-picker-${attribute}`}
                            attribute={attribute}
                            type={type}
                            sizeValue={this.state.sizeValue}
                            colorValue={this.state.colorValue}
                            showModal={this.state.showModal}
                            yAxisValue={this.state.yAxisValue}
                            onSizeChange={ this.handleSizeChange }
                            onColorChange={ this.handleColorChange }
                            onModalChange={ this.handleModalChange }
                            onYAxisChange={ this.handleYAxisChange} />
                        <Button href='javascript:void(0)'
                            className={classNames({
                                [stylesGlobal['fa']]: true,
                                [stylesGlobal['fa-times']]: true,
                                [styles['histogram-close']]: true
                            })} />
                    </div>
                    <span>{type}:{attribute}</span>
                </div>
                <div className={styles['histogram-picture-container']}>
                    <div className={styles['histogram-picture']}
                        style={{height: `${HEIGHT}px`, width: `${WIDTH}px`}}>
                    {
                        _.range(0, _global.numBins).map((binIdx) => {
                            return binToColumn(
                                summary,
                                {
                                    binIdx, attribute,
                                    binValue: _global.binValues ? _global.binValues[binIdx] : undefined,
                                    globalCount: _global.bins[binIdx],
                                    maskCount: _masked.bins ? _masked.bins[binIdx] : 0
                            });
                        })
                    }
                    </div>
                </div>
                <div style={{maxHeight: '200px', overflow: 'scroll'}}>{
                    /*
                        <div>
                            <b>Global</b>
                            <pre>{JSON.stringify(_global, null, 1)}</pre>
                        </div>
                    */
                    }{
                    /*
                        <div>
                            <b>Masked</b>
                            <pre>{JSON.stringify(_masked, null, 1)}</pre>
                        </div>
                    */
                }</div>
            </div>
        );
    }
}

Sparkline.propTypes = propTypes;
Sparkline.defaultProps = defaultProps;

