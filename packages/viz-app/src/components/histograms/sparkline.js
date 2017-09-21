import React from 'react';
import styles from './styles.less';
import classNames from 'classnames';
import { Button, Glyphicon } from 'react-bootstrap';
import { isEncoded, EncodingPicker } from './EncodingPicker';
import { SizeLegendIndicator, YAxisLegendIndicator, IconLegendIndicator } from './sparklineComponents';

export const Sparkline = ({ name, yScale, children, componentType,
                            id, width = `100%`, height = 50,
                            loading = false, filtered = false, colors = false,
                            isFilterEnabled = true, setEncoding, encodings,
                            onClose, onClearHighlight, onYScaleChanged, onEncodingChanged }) => {
    const { options } = encodings || {};
    return (
        <div className={classNames({
                [styles['histogram']]: true,
                [styles['has-filter']]: filtered,
                [styles['has-coloring']]: colors,
                [styles['filter-is-enabled']]: isFilterEnabled
            })}>
            <div className={styles['histogram-title']}>
                <div className={styles['histogram-icons']}>
                    <SizeLegendIndicator sizeValue={isEncoded(encodings, {componentType, attribute: name}, 'size')}
                                         onClick={() => setEncoding && setEncoding({
                                             reset: true,
                                             attribute: name,
                                             encodingType: 'size',
                                             graphType: componentType,
                                             name: componentType + 'Size'
                                         })}/>
                    <YAxisLegendIndicator yAxisValue={yScale}
                                          onClick={() => onYScaleChanged('none')}/>
                    <IconLegendIndicator iconValue={isEncoded(encodings, {componentType, attribute: name}, 'icon')}
                                         onClick={() => setEncoding && setEncoding({
                                             reset: true,
                                             attribute: name,
                                             encodingType: 'icon',
                                             graphType: componentType
                                         })}/>
                    <EncodingPicker sizeValue={[]}
                                    attribute={name}
                                    options={options}
                                    showModal={false}
                                    yAxisValue={yScale}
                                    encodings={encodings}
                                    setEncoding={setEncoding}
                                    componentType={componentType}
                                    onYAxisChange={onYScaleChanged}
                                    id={`histogram-encodings-picker-${name}`}/>
                    <Button bsSize='xsmall'
                            onClick={() => onClose({ id })}
                            className={classNames({
                                [styles['histogram-close']]: true,
                                [styles['histogram-loading']]: loading
                            })}>
                        {loading &&
                            <span className='Select-loading'/> ||
                            <i className='fa fa-fw fa-times'/>
                        }
                    </Button>
                </div>
                <span>
                    {componentType || '\u00a0'}
                    {componentType ? ':' : ''}
                    &#8203;{name || '\u00a0'}
                </span>
            </div>
            <div style={{ width, height }}
                 onMouseLeave={onClearHighlight}
                 className={styles['histogram-picture']}>
                {children}
            </div>
        </div>
    );
}
