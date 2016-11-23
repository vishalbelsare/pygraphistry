import React from 'react';
import { Button, Tooltip, Popover, OverlayTrigger } from 'react-bootstrap';
import classNames from 'classnames';

import styles from 'viz-shared/components/histograms/styles.less';
import stylesGlobal from 'viz-shared/index.less';


function SizeLegendIndicator (props) {
    return props.sizeValue
        ?  <span class="label label-default">
                <Button bsSize="small"
                    className={styles['histogram-legend-pill']}>
                    <span className={classNames({
                        'fa': true,
                        'fa-dot-circle-o': true,
                        [styles['histogram-size-encoding-icon']]: true
                    })}/>
                    Size
                </Button>
            </span>
        : null;
}
SizeLegendIndicator.propTypes = { sizeValue: React.PropTypes.array };



function YAxisLegendIndicator (props) {
    return props.yAxisValue !== 'none'
        ?   <span class="label label-default">
                <Button bsSize="small"
                    className={styles['histogram-legend-pill']}>
                    Y-Axis: {props.yAxisValue}
                </Button>
            </span>
        : null;
}
YAxisLegendIndicator.propTypes = { yAxisValue: React.PropTypes.string };

export { SizeLegendIndicator, YAxisLegendIndicator };
