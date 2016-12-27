import React from 'react';
import classNames from 'classnames';
import { Button, Glyphicon } from 'react-bootstrap';
import styles from 'viz-shared/components/histograms/styles.less';
import EncodingPicker from './EncodingPicker.js';
import { isEncoded } from 'viz-shared/components/histograms/EncodingPicker.js';
import { SizeLegendIndicator, YAxisLegendIndicator, IconLegendIndicator } from './sparklineComponents.js';

export const Sparkline = ({ name, yScale, children, componentType,
                            id, width = `calc(100% - 20px)`, height = 50,
                            loading = false, filtered = false, colors = false,
                            isFilterEnabled = true, setEncoding, options, encodings,
                            onClose, onYScaleChanged, onEncodingChanged }) => {
    return (
        <div className={classNames({
                [styles['histogram']]: true,
                [styles['has-filter']]: filtered,
                [styles['has-coloring']]: colors,
                [styles['filter-is-enabled']]: isFilterEnabled
            })}>
            <div className={styles['histogram-title']}>
                <div className={styles['histogram-icons']}>
                    <SizeLegendIndicator sizeValue={ isEncoded(encodings, {componentType, attribute: name}, 'size') }/>
                    <YAxisLegendIndicator yAxisValue={yScale}/>
                    <IconLegendIndicator iconValue={ isEncoded(encodings, {componentType, attribute: name}, 'icon') }/>
                    <EncodingPicker
                        id={`histogram-encodings-picker-${name}`}
                        attribute={name}
                        componentType={componentType}
                        showModal={false}
                        encodings={encodings}
                        yAxisValue={yScale}
                        sizeValue={[]}
                        onYAxisChange={onYScaleChanged}
                        setEncoding={setEncoding}
                        options={options}
                    />
                    <Button href='javascript:void(0)'
                        onClick={() => onClose({ id })}
                        className={classNames({
                            'fa': true,
                            'fa-spin': loading,
                            'fa-times': !loading,
                            'fa-spinner': loading,
                            [styles['histogram-close']]: true,
                            [styles['histogram-loading']]: loading
                        })}>
                    </Button>
                </div>
                <span>{componentType}:&#8203;{name}</span>
            </div>
            <div className={styles['histogram-picture']} style={{ width, height }}>
                {children}
            </div>
        </div>
    );
}
