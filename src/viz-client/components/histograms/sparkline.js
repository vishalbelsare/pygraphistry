import React from 'react';
import { Button, Tooltip, Popover, OverlayTrigger } from 'react-bootstrap';
import classNames from 'classnames';
import _ from 'underscore';

import styles from 'viz-shared/components/histograms/styles.less';
import stylesGlobal from 'viz-shared/index.less';

import EncodingPicker from './EncodingPicker.js';
import { SizeLegendIndicator, YAxisLegendIndicator } from './sparklineComponents.js';
import BinColumn from './BinColumn.js';

/***********

INSTRUCTIONS:
    -- Quinn: control/refactor:
        * colors: colorLegend, colorValue, onColorChange
        * sizes: sizeValue, onSizeChange
    -- Paul: control/refactor:
        * filters: filterValue, onBinMouseDown, onBinMouseOut
    -- When done, change the module export to Sparkline (instead of SparklineTest)



*************/



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
        binValues: [ null U {min: float, max: float, representative: *, isSingular: bool}]

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
    filterValue: React.PropTypes.object,

    onColorChange: React.PropTypes.func,
    onSizeChange: React.PropTypes.func,
    onModalChange: React.PropTypes.func.isRequired,
    onYAxisChange: React.PropTypes.func,

    onBinMouseDown: React.PropTypes.func,
    onBinMouseOver: React.PropTypes.func,

    setEncoding: React.PropTypes.func,
    resetEncoding: React.PropTypes.func,

    global: React.PropTypes.object,
    masked: React.PropTypes.object,
    attribute: React.PropTypes.string.isRequired,
    type: React.PropTypes.string.isRequired
};


const defaultProps = {
    sizeValue: [],
    colorValue: [],
    showModal: false,
    yAxisValue: 'none',

    onBinMouseDown: _.identity,
    onBinMouseOver: _.identity,

    width: 298 - 20, //anything less than the panel width
    height: 50,
    maxBinWidth: 60,
    minBinHeightNoneEmpty: 5
};


class Sparkline extends React.Component {
    constructor(props, context) {
        super(props, context);
        this.onBinMouseDown = this.onBinMouseDown.bind(this);
        this.onBinMouseOver = this.onBinMouseOver.bind(this);
        this.handleGenericChange = this.handleGenericChange.bind(this);
        this.state =
            _.object(
                ['showModal', 'yAxisValue']
                .map( (k) => [k, this.props[k]] ));
    }

    onBinMouseDown(binColumn) {
        this.props.onBinMouseDown(binColumn);
    }

    onBinMouseOver(binColumn) {
        this.props.onBinMouseOver(binColumn);
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

        const { binValues = [] } = _global;
        const binColumns = (_global.binType === 'histogram' ?
            _.range(0, _global.numBins) :
            _.keys(_global.bins).sort(function (a, b) {
                    if (a < b) return 1;
                    if (b < a) return -1;
                    return 0;
                })
        )
        .map((binKey, binIdx, bins) => {
            let min, max, equals;
            const binValue = binValues[binKey];
            if (binValue) {
                if (binValue.isSingular) {
                    equals = binValue.representative;
                } else {
                    min = binValue.min;
                    max = binValue.max;
                }
            } else {
                min = _global.minValue + (_global.binWidth * binIdx);
                max = min + _global.binWidth;
            }
            return {
                type, attribute,
                min, max, equals,
                binKey, binIdx, binValue,
                dataType: _global.dataType,
                globalCount: _global.bins[binKey],
                maskCount: _masked.bins ? _masked.bins[binKey] : 0
            };
        });

        return (
            <div className={`
                ${styles['histogram']}
                ${this.props.filterValue ? styles['has-filter']:''}
                ${this.props.colorLegend ? styles['has-coloring'] : ''}`}>

                <div className={styles['histogram-title']}>

                    <div className={styles['histogram-icons']}>
                        <SizeLegendIndicator sizeValue={this.props.sizeValue} />
                        <YAxisLegendIndicator yAxisValue={this.props.yAxisValue} />
                        <EncodingPicker
                            id={`histogram-encodings-picker-${attribute}`}
                            attribute={attribute}
                            type={type}
                            showModal={this.state.showModal}
                            yAxisValue={this.state.yAxisValue}
                            sizeValue={this.props.sizeValue}
                            colorValue={this.props.colorValue}
                            setEncoding={this.props.setEncoding}
                            resetEncoding={this.props.resetEncoding}
                            globalBinning={this.props.global}
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
                    {binColumns.map((binColumn, binIdx, bins) => (
                        <BinColumn
                            enabled={!this.props.filterValue || this.props.filterValue[binIdx]}
                            filterBounds={
                                !this.props.filterValue ? undefined
                                : !this.props.filterValue[binIdx] ? undefined
                                : {
                                    leftest: binIdx === 0 || !this.props.filterValue[binIdx - 1],
                                    rightest: binIdx === (bins.length - 1) || !this.props.filterValue[binIdx + 1]
                                }
                            }
                            onBinMouseDown={this.onBinMouseDown}
                            onBinMouseOver={this.onBinMouseOver}
                            colorLegend={this.props.colorLegend}
                            height={this.props.height}
                            minBinHeightNoneEmpty={this.props.minBinHeightNoneEmpty}
                            summary={summary}
                            bin={binColumn}
                        />
                    ))}
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



//TODO only for testing/demoing; remove and directly export Sparkline
function SparklineTest(props) {
    const rainbow = [ "rgb(166, 206, 227)", "rgb(31, 120, 180)", "rgb(178, 223, 138)", "rgb(51, 160, 44)", "rgb(251, 154, 153)", "rgb(227, 26, 28)", "rgb(253, 191, 111)", "rgb(255, 127, 0)", "rgb(202, 178, 214)", "rgb(106, 61, 154)", "rgb(255, 255, 153)", "rgb(177, 89, 40)" ];
    const colors1 = _.range(0, 30).map((i,idx,arr) => rainbow[i % rainbow.length]);
    const colors2 = _.range(0, 10).map((i,idx,arr)=>`rgb(${Math.round(i*255/arr.length)},${Math.round(i*255/arr.length)},255)`);

    return <Sparkline
        { ...props }
        onBinMouseOver={(bin) => {
            console.log('mouse over bin', bin);
        }}
        onBinMouseDown={(bin) => {
            console.log('mouse down bin', bin);
        }}
        filterValue={
            props.filterValue ||
            {
                'degree': {3:true, 4:true, 5:true, 6:true},
                //'community_infomap': true,
                'betweenness': {3:true, 4:true, 5:true, 6:true},

                'ip': {3:true, 4:true, 5:true, 6:true},
                'bytes': {3:true, 4:true, 5:true, 6:true},

            }[props.attribute]
        }
        colorLegend={
            {
                'degree': colors1,
                'community_infomap': colors2,
                'community_louvain': colors1,

                'ip': colors1,
                'bytes': colors2,
                'port': colors1,
                'time': colors2

            }[props.attribute]
        }

        sizeValue={
            {
                'degree': ['size'],
                'ip': ['size'],
                'community_infomap': [],
                'bytes': []
            }[props.attribute]
        }

        colorValue={
            {
                'degree': {value: 'color-continuous'},
                'community_infomap': {value: 'color-categorical'},
                'community_louvain': {value: 'color-continuous'},

                'ip': {value: 'color-continuous'},
                'bytes': {value: 'color-categorical'},
                'port': {value: 'color-continuous'},
                'time': {value: 'color-categorical'}
            }[props.attribute]
        }


    />;
}


///////

export {
    // Sparkline
    SparklineTest as Sparkline
}

