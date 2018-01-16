import React from 'react';
import styles from './styles.less';
import { Table, Tab, Tabs } from 'react-bootstrap';

function getMapping(encodings, binName, encodingType) {
    const viaFixedCategoricalMapping =
        encodings.mapping && encodings.mapping.categorical && encodings.mapping.categorical.fixed;

    const viaBins =
        !viaFixedCategoricalMapping &&
        encodings.binning &&
        encodings.binning.bins &&
        encodings.binning.bins instanceof Array;

    if (viaBins) {
        if (encodingType === 'icons') {
            return binName; //ignores bin
        }
        for (let binIndex = 0; binIndex < encodings.binning.bins.length; binIndex++) {
            const bin = encodings.binning.bins[binIndex];
            for (let valIndex = 0; valIndex < bin.values.length; valIndex++) {
                if (bin.values[valIndex] === binName) {
                    const val = encodings.legend[binIndex];
                    return encodingType === 'sizes' ? val * 2 : val;
                }
            }
        }
        return undefined;
    } else if (viaFixedCategoricalMapping) {
        return encodings.mapping.categorical.fixed[binName] || encodings.mapping.categorical.other;
    } else {
        return undefined;
    }
}

function LegendFooter({
    bins,
    iconEncodings,
    iconsOn,
    colorEncodings,
    colorsOn,
    sizeEncodings,
    sizesOn
}) {
    function toRow(name, attr) {
        return (
            <div className={styles['encodingRow']}>
                <span className={styles['encodingType']}>{name}</span>
                <span className={styles['encodingSpacer']} />
                <span className={styles['encodingAttr']}>{attr}</span>
            </div>
        );
    }

    return (
        <div className={`${styles['footer']}`}>
            {iconEncodings && !iconsOn ? toRow('Icons', iconEncodings.attribute) : undefined}
            {colorEncodings && !colorsOn
                ? toRow('Colors', colorEncodings.attribute)
                : !colorEncodings ? toRow('Colors', <i>cluster</i>) : undefined}
            {sizeEncodings && !sizesOn
                ? toRow('Sizes', sizeEncodings.attribute)
                : !sizeEncodings ? toRow('Sizes', 'degree') : undefined}
        </div>
    );
}


//bool * ?[ ?{ values: [ int ], count: int } ]
// -> ?[ ?{ values: [ int ], count: int } ]
// Some pivots may have no values because Falcor streaming or no results,
//  so fill them in (or bail)
function expandPivotBins(isPivot, bins) {

    if (bins === null || !isPivot || !bins.length) {
        return bins;
    }

    for (let i = 0; i < bins.length; i++) {
        if (!bins[i]) {
            return null;
        }

    }

    const maxPivot = bins.reduce((acc, { values: [v] }, i) => Math.max(v, acc), bins[0].values[0]);

    return Array.apply(null, { length: maxPivot })
        .map(Function.call, Number)
        .map((_, i) => {
            const pivot = bins.filter(({ values: [pivot] }) => pivot === i + 1);
            return pivot.length ? pivot[0] : { values: [i + 1], count: 0, exclude: false };
        });
}

export const LegendBody = function({
    name,
    bins: binsWithNulls,
    iconEncodings,
    iconsOn,
    colorEncodings,
    colorsOn,
    sizeEncodings,
    sizesOn,
    parentKey
}) {
    const isPivot = name === 'Pivot';


    const bins = expandPivotBins(isPivot, binsWithNulls);


    const table =
        theBins === null ? (
            undefined
        ) : (
            <Table striped condensed key={`${parentKey}-body-full`}>
                <thead>
                    <tr>
                        <th
                            className={`${colorsOn || sizesOn
                                ? ''
                                : styles['columnEmpty']} ${styles['colorCol']}`}>
                            Color
                        </th>
                        <th className={styles['typeCol']}>{name}</th>
                        {isPivot ? null : (
                            <th
                                className={`${iconsOn ? '' : styles['columnEmpty']} ${styles[
                                    'iconCol'
                                ]}`}>
                                Icon
                            </th>
                        )}
                        <th className={styles['countCol']}>Count</th>
                    </tr>
                </thead>
                <tbody>
                    {theBins.map(({ count, values }, i) => {
                        const binName = values[0];

                        const specialIcon = iconsOn
                            ? getMapping(iconEncodings, binName, 'icons')
                            : undefined;
                        const specialIconOn = iconsOn && specialIcon !== undefined;

                        const specialSize = sizesOn
                            ? getMapping(sizeEncodings, binName, 'sizes')
                            : undefined;
                        const specialSizeOn = sizesOn && specialSize !== undefined;

                        const specialColor = colorsOn
                            ? getMapping(colorEncodings, binName, 'colors')
                            : undefined;
                        const specialColorOn = colorsOn && specialColor !== undefined;

                        const renderedIcon = specialIconOn ? (
                            <i className={`fa fa-fw fa-${specialIcon}`} />
                        ) : (
                            <span>&mdash;</span>
                        );
                        const renderedColorStyle = specialColorOn
                            ? { backgroundColor: specialColor }
                            : {};
                        const renderedSizeStyle = specialSizeOn
                            ? {
                                  height: `${1 * specialSize / 100}em`,
                                  width: `${1 * specialSize / 100}em`
                              }
                            : colorsOn
                              ? { height: '2em', width: '2em' }
                              : { height: '0', width: '0' };
                        return (
                            <tr key={`${parentKey}-body-full-row-${i}`}>
                                <td
                                    className={`${colorsOn || sizesOn
                                        ? ''
                                        : styles['columnEmpty']} ${styles['colorCol']}`}>
                                    <div className={styles['dotContainer']}>
                                        <div className={styles[specialSizeOn ? 'dot' : 'noDot']}>
                                            <div
                                                className={styles[specialColorOn ? '' : 'noColor']}
                                                style={Object.assign(
                                                    { borderRadius: 'inherit' },
                                                    renderedColorStyle,
                                                    renderedSizeStyle
                                                )}
                                            />
                                        </div>
                                    </div>
                                </td>
                                <td className={styles['typeCol']}>
                                    <span>{binName}</span>
                                </td>
                                {isPivot ? null : (
                                    <td
                                        className={`${iconsOn
                                            ? ''
                                            : styles['columnEmpty']} ${styles['iconCol']}`}>
                                        {renderedIcon}
                                    </td>
                                )}
                                <td className={styles['countCol']}>{count}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </Table>
        );

    return (
        <div>
            {table}
            <LegendFooter
                bins={bins}
                iconEncodings={iconEncodings}
                iconsOn={iconsOn}
                sizeEncodings={sizeEncodings}
                sizesOn={sizesOn}
                colorEncodings={colorEncodings}
                colorsOn={colorsOn}
            />
        </div>
    );
};

export const Legend = ({
    cols,
    visible,
    legendPivotHisto,
    encodings,
    activeTab,
    onTabSelected
}) => {
    const pointIconEncodingAttribute =
        (encodings && encodings.point && encodings.point.icon && encodings.point.icon.attribute) ||
        '';
    const pointSizeEncodingAttribute =
        (encodings && encodings.point && encodings.point.size && encodings.point.size.attribute) ||
        '';
    const pointColorEncodingAttribute =
        (encodings &&
            encodings.point &&
            encodings.point.color &&
            encodings.point.color.attribute) ||
        '';

    const pointColor = encodings && encodings.point && encodings.point.color;
    const pointSize = encodings && encodings.point && encodings.point.size;
    const pointIcon = encodings && encodings.point && encodings.point.icon;

    const canonicalTypeAttribute = 'canonicalType';
    const pivotAttribute = 'Pivot'; // maybe pull these from the histogram model?
    const typeBins = cols && cols.global && cols.global.bins ? cols.global.bins : null;
    const pivotBins =
        legendPivotHisto && legendPivotHisto.global && legendPivotHisto.global.bins
            ? legendPivotHisto.global.bins
            : null;
    const typeKey = [
        pointIconEncodingAttribute === canonicalTypeAttribute,
        pointSizeEncodingAttribute === canonicalTypeAttribute,
        pointColorEncodingAttribute === canonicalTypeAttribute
    ];
    const pivotKey = [
        pointIconEncodingAttribute === pivotAttribute,
        pointSizeEncodingAttribute === pivotAttribute,
        pointColorEncodingAttribute === pivotAttribute
    ];
    const parentTypeKey = `legend-type-${typeBins && typeBins.length}-${typeKey.join()}`;
    const parentPivotKey = `legend-pivot-${pivotBins && pivotBins.length}-${pivotKey}`;
    return !visible ? null : (
        <div className={styles['legendContainer']}>
            <Tabs onSelect={onTabSelected} id="legend-tabset" defaultActiveKey={activeTab}>
                <Tab eventKey={'legendDisabled'} title="Node Legend" disabled />
                <Tab eventKey={'legendTypeTab'} title="Type">
                    <LegendBody
                        name="Type"
                        bins={typeBins}
                        iconEncodings={pointIcon}
                        iconsOn={typeKey[0]}
                        sizeEncodings={pointSize}
                        sizesOn={typeKey[1]}
                        colorEncodings={pointColor}
                        colorsOn={typeKey[2]}
                        key={parentTypeKey}
                        parentKey={parentTypeKey}
                    />
                </Tab>
                <Tab eventKey={'legendPivotTab'} title="Pivot" disabled={pivotBins === null}>
                    <LegendBody
                        name="Pivot"
                        bins={pivotBins}
                        iconEncodings={pointIcon}
                        iconsOn={pivotKey[0]}
                        sizeEncodings={pointSize}
                        sizesOn={pivotKey[1]}
                        colorEncodings={pointColor}
                        colorsOn={pivotKey[2]}
                        key={parentPivotKey}
                        parentKey={parentPivotKey}
                    />
                </Tab>
            </Tabs>
        </div>
    );
};
