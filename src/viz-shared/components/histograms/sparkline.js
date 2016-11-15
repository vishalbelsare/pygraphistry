import React from 'react';
import classNames from 'classnames';
import { Button, Glyphicon } from 'react-bootstrap';


import { SizeLegendIndicator, YAxisLegendIndicator } from './sparklineComponents.js';
import EncodingPicker from './EncodingPicker.js';
import globalStyles from 'viz-shared/index.less';
import styles from 'viz-shared/components/histograms/styles.less';

export const Sparkline = ({ name, yScale, children, componentType,
                            id, width = `calc(100% - 20px)`, height = 50,
                            loading = false, filtered = false, colors = false,
                            setEncoding,
                            options, encoding,
                            onClose, onYScaleChanged, onEncodingChanged }) => {
    return (
        <div className={classNames({
                [styles['histogram']]: true,
                [styles['has-filter']]: filtered,
                [styles['has-coloring']]: colors,
            })}>
            <div className={styles['histogram-title']}>
                <div className={styles['histogram-icons']}>
                    <SizeLegendIndicator sizeValue={[]}/>
                    <YAxisLegendIndicator yAxisValue={yScale}/>
                    <EncodingPicker
                        id={`histogram-encodings-picker-${name}`}
                        attribute={name}
                        type={componentType}
                        showModal={false}
                        yAxisValue={yScale}
                        sizeValue={[]}
                        colorValue={[]}
                        onYAxisChange={onYScaleChanged}
                        setEncoding={setEncoding}
                        options={options}
                    />
                    <Button href='javascript:void(0)'
                        onClick={() => onClose({ id })}
                        className={classNames({
                            [styles['fa']]: true,
                            [styles['fa-spin']]: loading,
                            [styles['fa-times']]: !loading,
                            [styles['fa-spinner']]: loading,
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
