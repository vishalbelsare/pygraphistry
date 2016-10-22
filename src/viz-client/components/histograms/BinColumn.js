import React from 'react';
import { Button, Tooltip, Popover, OverlayTrigger } from 'react-bootstrap';

import styles from 'viz-shared/components/histograms/styles.less';

import { defaultFormat, shortFormat } from './contentFormatter.js';


function formRow(label, entry) {
    return (
        <div style={{whiteSpace: 'nowrap', fontSize: '11px'}}>
            <span style={{display: 'inline-block', minWidth: '70px', textAlign: 'right'}}>
                {label}
            </span>
            <label style={{marginLeft: '10px'}}>{entry}</label>
        </div>);
}

function BinColumn(
    {   minBinHeightNoneEmpty, height, colorLegend, enabled, filterBounds,
        summary: {
            numBins, binMax, binType, minValue, binPixelWidth, binRangeWidth,
            leftOffset, dataType, yAxisValue, trans, isMasked
        },
        bin: {attribute, binIdx, binKey, globalCount, maskCount, binValue}}) {

    const globalHeightCalc =
        globalCount ?
            Math.max(height * trans(globalCount) / (trans(binMax) || 1), minBinHeightNoneEmpty)
            : 0;
    const maskHeightCalc =
        maskCount ?
            Math.max(height * trans(maskCount) / (trans(binMax) || 1), minBinHeightNoneEmpty)
            : 0;


    return (
        <OverlayTrigger trigger={['hover']}
            placement='bottom'
            overlay={
                <Popover id={`tooltip-histogram-${attribute}-col-${binIdx}`} style={{zIndex: 999999999}}>
                    {       binType === 'nodata' ? undefined
                        :   binType === 'histogram' && binValue ?
                                formRow(
                                    'RANGE',
                                    `${shortFormat(binValue.min, dataType)} : ${shortFormat(binValue.max, dataType)}`)
                        :   binType === 'histogram' && !binValue ?
                                formRow(
                                    'RANGE',
                                    `${shortFormat(minValue + binRangeWidth * binIdx, dataType)} : ${shortFormat(minValue + binRangeWidth * (binIdx + 1), dataType)}`)
                        :   binType === 'countBy' ?
                                formRow('CATEGORY', `${binKey}`)
                        :   undefined
                    }
                    {   formRow('COUNT', globalCount)}
                    {
                        //less jumping this way
                        maskCount ?
                            formRow(
                                <span style={{color: '#ff6600'}}>SELECTED</span>,
                                <span style={{color: '#ff6600'}}>{maskCount}</span>)
                            : undefined }
                    {   binValue && binValue.isSingular && binValue.representative != '_other'?
                            formRow('ONE VALUE', binValue.representative)
                            : undefined
                    }
                </Popover>
            }>
            <div className={`${styles['histogram-column']}
                    ${styles['is-masked-' + isMasked]}
                    ${styles['is-filter-' + !enabled]}
                    ${ (filterBounds||{}).leftest ? styles.leftest : ''}
                    ${ (filterBounds||{}).rightest ? styles.rightest : ''}`}
                data-binmax={binMax}
                style={{
                    left: `${leftOffset + binIdx * binPixelWidth}px`,
                    width: `${binPixelWidth}px`
                }}>
                <div className={`${styles['bar-rect']} ${styles['bar-bg']} ${styles['bar-bg-bg']}`}
                    style={{
                        backgroundColor: colorLegend ? colorLegend[binIdx] : 'transparent'
                    }} />
                <div className={`${styles['bar-rect']} ${styles['bar-bg']} ${styles['bar-bg-fade']}`}
                    style={{

                    }} />
               <div className={`${styles['bar-global']} ${styles['bar-rect']}`}
                    data-count={globalCount}
                    style={{
                        height: `${globalHeightCalc}px`,
                        top: `${height - globalHeightCalc}`,
                        backgroundColor: colorLegend ? colorLegend[binIdx] : '#BBB',
                        visibility: globalCount ? 'visible' : 'hidden'
                    }} />
               <div className={`${styles['bar-masked']} ${styles['bar-rect']}`}
                    data-count={maskCount}
                    style={{
                        height: `${maskHeightCalc}px`,
                        top: `${height - maskHeightCalc}px`,
                        backgroundColor: colorLegend ? colorLegend[binIdx] : 'rgb(15, 165, 197)',
                        visibility: maskCount ? 'visible' : 'hidden'
                    }} />
            </div>
        </OverlayTrigger>);
}
BinColumn.propTypes = {
    summary: React.PropTypes.object,
    bin: React.PropTypes.object,
    height: React.PropTypes.number,
    minBinHeightNoneEmpty: React.PropTypes.number,
    colorLegend: React.PropTypes.Array,
    filterBounds: React.PropTypes.object
};

export default BinColumn;
