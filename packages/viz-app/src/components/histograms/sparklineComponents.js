import React from 'react';
import styles from './styles.less';
import classNames from 'classnames';
import { Button, Tooltip, OverlayTrigger } from 'react-bootstrap';

const tooltipShowDelay = 350;
const SizeLegendIndicatorTooltip = (
    <Tooltip id='SizeLegendIndicatorTooltip'>
        Reset sizes
    </Tooltip>
);
const YAxisLegendIndicatorTooltip = (
    <Tooltip id='YAxisLegendIndicatorTooltip'>
        Reset Y-Axis
    </Tooltip>
);
const IconLegendIndicatorTooltip = (
    <Tooltip id='IconLegendIndicatorTooltip'>
        Reset icons
    </Tooltip>
);

function SizeLegendIndicator ({ sizeValue, ...props }) {
    return !sizeValue ? null : (
        <span class='label label-default'>
            <OverlayTrigger placement='top'
                            delayShow={tooltipShowDelay}
                            overlay={SizeLegendIndicatorTooltip}>
                <Button className={styles['histogram-legend-pill']}
                        bsSize='xsmall' href='javascript:void(0)' {...props}>
                    <i className={classNames({
                        'fa': true, 'fa-dot-circle-o': true,
                        [styles['histogram-size-encoding-icon']]: true
                    })}/>
                    {/*Size*/}
                </Button>
            </OverlayTrigger>
        </span>
    );
}
SizeLegendIndicator.propTypes = { sizeValue: React.PropTypes.array };

function YAxisLegendIndicator ({ yAxisValue = 'none', ...props }) {
    return yAxisValue == 'none' ? null : (
        <span class='label label-default'>
            <OverlayTrigger placement='top'
                            delayShow={tooltipShowDelay}
                            overlay={YAxisLegendIndicatorTooltip}>
                <Button className={styles['histogram-legend-pill']}
                        bsSize='xsmall' href='javascript:void(0)' {...props}>
                    <i className={classNames({
                        'fa': true, 'fa-signal': true,
                        [styles['histogram-size-encoding-icon']]: true
                    })}/>
                    {/*Y-Axis: {yAxisValue}*/}
                </Button>
            </OverlayTrigger>
        </span>
    );
}
YAxisLegendIndicator.propTypes = { yAxisValue: React.PropTypes.string };

function IconLegendIndicator ({ iconValue, ...props }) {
    return !iconValue ? null : (
        <span class='label label-default'>
            <OverlayTrigger placement='top'
                            delayShow={tooltipShowDelay}
                            overlay={IconLegendIndicatorTooltip}>
                <Button className={styles['histogram-legend-pill']}
                        bsSize='xsmall' href='javascript:void(0)' {...props}>
                    <i className={classNames({
                        'fa': true, 'fa-map-pin': true,
                        [styles['histogram-size-encoding-icon']]: true
                    })}/>
                    {/*Icon*/}
                </Button>
            </OverlayTrigger>
        </span>
    );
}

export { SizeLegendIndicator, YAxisLegendIndicator, IconLegendIndicator };
