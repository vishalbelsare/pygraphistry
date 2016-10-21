import React from 'react';
import { Button, Tooltip, Popover, OverlayTrigger } from 'react-bootstrap';
import classNames from 'classnames';
import _ from 'underscore';

import styles from 'viz-shared/components/histograms/styles.less';
import stylesGlobal from 'viz-shared/index.less';

import EncodingPicker from './EncodingPicker.js';
import { SizeLegendIndicator, YAxisLegendIndicator } from './SparklineComponents.js';
import BinColumn from './BinColumn.js';


/*
The histograms data structure is an adventure:

------
For binType='histogram': //continuous values
------
_globals:
    {
        binType: 'histogram'
        dataType: 'number'
        bins:
            [int, ...]
        binValues:
            //null when 0
            //buggy min/max so better to use minValue + binWidth * binIndex
            [ null U {min: float, max: float, representative: * , isSingular: bool}]
        numBins: int,
        numValues: int
        minValue: number //of range
        maxValue: number //of range
        binWidth: number
        type: 'point' or 'edge'
        attribute: 'string'
    }
_masked:
    {
        binType: 'histogram'
        dataType: 'number'

        //as long as globals, null if no selection
        ? bins: [int, ... ]

        //as long as globals, , null if no selection
        binValues: [ null U {min: float, max: float, representative: *, isSIngular: bool}]

        numBins: int,
        numValues: int
        maxValue: number
        type: 'point' or 'edge'
        attribute: 'string'
        binWidth: number
    }

------
For binType='countBy': //categorical (string, small ints, ...)
------
_globals:  //no maxValue,
    {
        binType: 'countBy'
        dataType: 'string' or 'number'
        bins: {<string>: int, ...}
        ? binValues: { '_other': {representative: '_other', numValues: int}}
        numBins: int
        numValues: int
        type: 'point' or 'edge'
        attribute: 'string'

    }
_masked:
    {
        type: 'point' or 'edge'
        attribute: 'string' or 'number'
        binType: 'point' or 'edge' or 'nodata' (if no data)

        //null if 'nodata'
        ?bins: {<string>: int }

        //null if 'nodata' or type != 'string'
        ?binValues:  {
            '_other': {
                representative: '_other',
                numValues: int
            }
        }

    }
*/

const typeHelpers = {
    nodata: {
        computeBinMax: (() => 0),
        isMasked: (() => false)
    },
    histogram: {
        computeBinMax: (({bins}) => Math.max.apply(null, bins)),
        isMasked: (({bins}) => {
            for (var i = 0; i < bins.length; i++) {
                if (bins[i] > 0) return true;
            }
            return false;
        })
    },
    countBy: {
        computeBinMax: (({bins}) => Math.max.apply(null, _.values(bins))),
        isMasked: (({bins})=> {
            for (var i in bins) {
                if (bins[i]) return true;
            }
            return false;
        })
    }
}


function computeBinMax ({bins, binType}) {
    return typeHelpers[binType].computeBinMax({bins});
}


function getIsMasked({bins, binValues, numBins, binType}={}) {
    if (!binType) return false;
    return typeHelpers[binType].isMasked({bins, binValues, numBins, binType});
}



/*
const MIN_BIN_HEIGHT_NONEMPTY = ;
*/

const propTypes = {

    width: React.PropTypes.number,
    height: React.PropTypes.number,
    maxBinWidth: React.PropTypes.number,
    minBinHeightNoneEmpty: React.PropTypes.number,

    sizeValue: React.PropTypes.Array,
    colorValue: React.PropTypes.Array,
    showModal: React.PropTypes.bool,
    yAxisValue: React.PropTypes.string,
    colorLegend: React.PropTypes.Array,

    onColorChange: React.PropTypes.func,
    onSizeChange: React.PropTypes.func,
    onModalChange: React.PropTypes.func.isRequired,
    onYAxisChange: React.PropTypes.func,

    global: React.PropTypes.object,
    masked: React.PropTypes.object,
    attribute: React.PropTypes.string.isRequired,
    type: React.PropTypes.string.isRequired
};

const rainbow = [ "rgb(166, 206, 227)", "rgb(31, 120, 180)", "rgb(178, 223, 138)", "rgb(51, 160, 44)", "rgb(251, 154, 153)", "rgb(227, 26, 28)", "rgb(253, 191, 111)", "rgb(255, 127, 0)", "rgb(202, 178, 214)", "rgb(106, 61, 154)", "rgb(255, 255, 153)", "rgb(177, 89, 40)" ];
const colors1 = _.range(0, 30).map((i,idx,arr) => rainbow[i % rainbow.length]);
const colors2 = _.range(0, 30).map((i,idx,arr)=>`rgb(${Math.round(i*255/arr.length)},${Math.round(i*255/arr.length)},255)`);

const defaultProps = {
    sizeValue: [],
    colorValue: [],
    showModal: false,
    yAxisValue: 'none',

    width: 298 - 20, //anything less than the panel width
    height: 50,
    maxBinWidth: 60,
    minBinHeightNoneEmpty: 5
};



export class Sparkline extends React.Component {
    constructor(props, context) {
        super(props, context);
        this.handleGenericChange = this.handleGenericChange.bind(this);
        this.state =
            _.object(
                //encoding info
                ['sizeValue', 'colorValue', 'showModal', 'yAxisValue']
                .map( (k) => [k, this.props[k]] ));
        this.state.colorLegend =
            {
                'degree': colors1,
                'community_infomap': colors2,

                'ip': colors1,
                'bytes': colors2

            }[props.attribute];

    }

    handleGenericChange (field, handler, value) {
        var state = {};
        state[field] = value;
        this.setState(state);
        if (this.props[handler]) {
            this.props[handler](value);
        }
    }

    render() {

        let { global: _global = {},
              masked: _masked = {},
              type, attribute } = this.props;

        let summary = {
            numBins: _global.numBins,
            binMax:  computeBinMax(_global),
            binType: _global.binType,
            minValue: _global.minValue, //for binType=='histogram'
            maxValue: _global.maxValue, //for binType=='histogram'
            binPixelWidth: Math.min(Math.round(this.props.width / (_global.numBins || 1)), this.props.maxBinWidth),
            dataType: _global.dataType,
            binRangeWidth: _global.binWidth, //undefined when dataType==='string'
            leftOffset: 0,
            yAxisValue: this.state.yAxisValue, //'none', 'log2', ...
            trans: ({
                    'none': _.identity,
                    'log': Math.log,
                    'log2': Math.log2,
                    'log10': Math.log10
                })[this.state.yAxisValue],
            isMasked: getIsMasked(_masked)
            };
        summary.leftOffset = Math.floor((this.props.width - summary.binPixelWidth * summary.numBins) / 2);
        Object.freeze(summary);


        return (
            <div className={styles['histogram']}>

                <div className={styles['histogram-title']}>

                    <div className={styles['histogram-icons']}>
                        <SizeLegendIndicator sizeValue={this.state.sizeValue} />
                        <YAxisLegendIndicator yAxisValue={this.state.yAxisValue} />
                        <EncodingPicker
                            id={`histogram-encodings-picker-${attribute}`}
                            attribute={attribute}
                            type={type}
                            sizeValue={this.state.sizeValue}
                            colorValue={this.state.colorValue}
                            showModal={this.state.showModal}
                            yAxisValue={this.state.yAxisValue}
                            onSizeChange={ this.handleGenericChange.bind(this, 'sizeValue', 'onSizeChange') }
                            onColorChange={ this.handleGenericChange.bind(this, 'colorValue', 'onColorChange') }
                            onModalChange={ this.handleGenericChange.bind(this, 'showModal', 'onModalChange') }
                            onYAxisChange={ this.handleGenericChange.bind(this, 'yAxisValue', 'onYAxisChange') }
                        />
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
                        style={{height: `${this.props.height}px`, width: `${this.props.width}px`}}>
                    {
                        (_global.binType === 'histogram' ?
                            _.range(0, _global.numBins)
                            : _.keys(_global.bins).sort(function (a, b) {
                                    if (a < b) return 1;
                                    if (b < a) return -1;
                                    return 0;
                                }))
                        .map((binKey, binIdx) => {
                            return <BinColumn
                                colorLegend={this.state.colorLegend}
                                height={this.props.height}
                                minBinHeightNoneEmpty={this.props.minBinHeightNoneEmpty}
                                summary={summary}
                                bin={ {binKey, binIdx, attribute,
                                     binValue: _global.binValues ? _global.binValues[binKey] : undefined,
                                     globalCount: _global.bins[binKey],
                                     maskCount: _masked.bins ? _masked.bins[binKey] : 0} } />;
                        })
                    }
                    </div>
                </div>
                {/*<div style={{maxHeight: '200px', overflow: 'scroll'}}>
                    <div>
                        <b>Global</b>
                        <pre>{JSON.stringify(_global, null, 1)}</pre>
                    </div>
                    <div>
                        <b>Masked</b>
                        <pre>{JSON.stringify(_masked, null, 1)}</pre>
                    </div>
                </div>*/}
            </div>
        );
    }
}

Sparkline.propTypes = propTypes;
Sparkline.defaultProps = defaultProps;

