import React from 'react';
import { Button, Tooltip, OverlayTrigger } from 'react-bootstrap';
import classNames from 'classnames';
import _ from 'underscore';

import styles from 'viz-shared/components/histograms/styles.less';
import stylesGlobal from 'viz-shared/index.less';



const WIDTH = 298 - 20; //anything less than the panel width
const HEIGHT = 50;
const MAX_BIN_WIDTH = 60;
const MIN_BIN_HEIGHT_NONEMPTY = 20;

function binToColumn({numBins, binMax, binWidth, leftOffset}, {attribute, binIdx, globalCount, maskCount}) {

    const globalHeightCalc =
        globalCount ?
            Math.max(HEIGHT * globalCount / (binMax || 1), MIN_BIN_HEIGHT_NONEMPTY)
            : 0;
    const maskHeightCalc =
        maskCount ?
            Math.max(HEIGHT * maskCount / (binMax || 1), MIN_BIN_HEIGHT_NONEMPTY)
            : 0;

    return (
        <OverlayTrigger trigger={['hover']}
                        placement='left'
                        overlay={<Tooltip
                            id={`tooltip-histogram-${attribute}-col-${binIdx}`}
                            style={{zIndex: 999999999}}
                            >{attribute}</Tooltip>}>
            <div className={styles['histogram-column']}
                style={{
                    left: `${leftOffset + binIdx * WIDTH / (numBins || 1)}px`,
                    width: `${WIDTH / (numBins || 1)}px`
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
    }
    render() {

        let { global: _global = {},
              masked: _masked = {},
              type, attribute } = this.props;

        let summary = {
            numBins: _global.numBins,
            binMax: Math.max.apply(null, _global.bins),
            binWidth: Math.min(WIDTH / (_global.numBins || 1), MAX_BIN_WIDTH),
            leftOffset: 0
        };
        summary.leftOffset = (WIDTH - summary.binWidth * summary.numBins) / 2;
        Object.freeze(summary);

        return (
            <div className={styles['histogram']}>

                <div className={styles['histogram-title']}>
                    <Button href='javascript:void(0)'
                        className={classNames({
                            [stylesGlobal['fa']]: true,
                            [stylesGlobal['fa-times']]: true,
                            [styles['histogram-close']]: true
                        })} />
                    <span>{type}:{attribute}</span>
                </div>
                <div className={styles['histogram-info-top']}></div>
                <div className={styles['histogram-picture-container']}>
                    <div className={styles['histogram-picture']}
                        style={{height: `${HEIGHT}px`, width: `${WIDTH}px`}}>
                    {
                        _.range(0, _global.numBins).map((binIdx) => {
                            return binToColumn(
                                summary,
                                {
                                    binIdx, attribute,
                                    globalCount: _global.bins[binIdx],
                                    maskCount: _masked.bins ? _masked.bins[binIdx] : 0
                            });
                        })
                    }
                    </div>
                </div>
                <div className={styles['histogram-info-bottom']}>
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
