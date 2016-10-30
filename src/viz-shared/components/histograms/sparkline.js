import React from 'react';
import classNames from 'classnames';
import { Button, Glyphicon } from 'react-bootstrap';
import globalStyles from 'viz-shared/index.less';
import styles from 'viz-shared/components/histograms/styles.less';

export const Sparkline = ({ id, width = `calc(100% - 20px)`, height = 50,
                            filtered = false, colors = false,
                            name, yScale, children, componentType,
                            onClose, onYScaleChanged, onEncodingChanged }) => {

    return (
        <div className={classNames({
                [styles['histogram']]: true,
                [styles['has-filter']]: filtered,
                [styles['has-coloring']]: colors,
            })}>
            <div className={styles['histogram-title']}>
                <div className={styles['histogram-icons']}>
                    {/*
                    <SizeLegendIndicator sizeValue={[]} />
                    <YAxisLegendIndicator yAxisValue={yScale} />
                    <EncodingPicker
                        id={`histogram-encodings-picker-${name}`}
                        attribute={name}
                        type={componentType}
                        showModal={false}
                        yAxisValue={yScale}
                        sizeValue={[]}
                        colorValue={[]}
                        onYAxisChange={onYScaleChanged}
                        onSizeChange={onEncodingChanged}
                        onColorChange={onEncodingChanged}
                    />
                    */}
                    <Button href='javascript:void(0)'
                        onClick={() => onClose({ id })}
                        className={classNames({
                            [globalStyles['fa']]: true,
                            [globalStyles['fa-times']]: true,
                            [styles['histogram-close']]: true
                        })}/>
                </div>
                <span>{componentType}:&#8203;{name}</span>
            </div>
            <div className={styles['histogram-picture']} style={{ width, height }}>
                {children}
            </div>
        </div>
    );
}
