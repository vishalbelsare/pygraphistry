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

export const LegendBody = ({
    bins,
    iconEncodings,
    iconsOn,
    colorEncodings,
    colorsOn,
    sizeEncodings,
    sizesOn,
    parentKey
}) =>
    bins === null ? (
        <div key={`${parentKey}-body`}>No data.</div>
    ) : (
        <Table striped bordered condensed hover key={`${parentKey}-body-full`}>
            <thead>
                <tr>
                    <th
                        className={`${colorsOn || sizesOn ? '' : styles['columnEmpty']} ${styles[
                            'colorCol'
                        ]}`}>
                        Color
                    </th>
                    <th className={styles['typeCol']}>Type</th>
                    <th className={`${iconsOn ? '' : styles['columnEmpty']} ${styles['iconCol']}`}>
                        Icon
                    </th>
                    <th className={styles['countCol']}>Count</th>
                </tr>
            </thead>
            <tbody>
                {bins.map(({ count, values }, i) => {
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
                        : colorsOn ? { height: '2em', width: '2em' } : { height: '0', width: '0' };
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
                            <td
                                className={`${iconsOn ? '' : styles['columnEmpty']} ${styles[
                                    'iconCol'
                                ]}`}>
                                {renderedIcon}
                            </td>
                            <td className={styles['countCol']}>{count}</td>
                        </tr>
                    );
                })}
            </tbody>
        </Table>
    );

export const EmptyLegend = <div />;

export const Legend = ({ cols, visible, legendPivotHisto, encodings }) => {
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
    const typeBins = cols.global && cols.global.bins ? cols.global.bins : null;
    const pivotBins =
        legendPivotHisto.global && legendPivotHisto.global.bins
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
    return !visible ? null : typeBins === null && pivotBins === null ? (
        EmptyLegend
    ) : (
        <div className={styles['legendContainer']}>
            <Tabs defaultActiveKey={typeBins ? 2 : 3} id="legend-tabset">
                <Tab eventKey={1} title="Node Legend" disabled />
                <Tab eventKey={2} title="Type" disabled={typeBins === null}>
                    <LegendBody
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
                <Tab eventKey={3} title="Pivot" disabled={pivotBins === null}>
                    <LegendBody
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
