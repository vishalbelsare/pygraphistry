import styles from './styles.less';
import classNames from 'classnames';
import { Popover, OverlayTrigger } from 'react-bootstrap';
import { shortFormat, defaultFormat } from 'viz-app/formatters';
import { ColorPill } from 'viz-app/components/color-pill/colorPill';

export const SparklineBar = ({
    color = false,
    componentType,
    index,
    name,
    binType,
    dataType,
    values = [],
    binWidth = `20px`,
    isMasked = false,
    filtered = false,
    maskedCount = 0,
    maskedHeight = `50%`,
    globalCount = 0,
    globalHeight = `100%`,
    onBinTouchMove,
    onBinTouchStart,
    onBinTouchCancel,
    filterBounds = { leftest: false, rightest: false }
}) => {
    const { leftest, rightest } = filterBounds;

    return (
        <OverlayTrigger
            trigger={['hover']}
            placement="bottom"
            overlay={
                <Popover id={`histogram-${name}-tooltip`} style={{ zIndex: 999999999 }}>
                    <SparklineBarInfo
                        color={color}
                        values={values}
                        binType={binType}
                        dataType={dataType}
                        globalCount={globalCount}
                        maskedCount={maskedCount}
                    />
                </Popover>
            }>
            <div
                style={{ width: binWidth }}
                className={classNames({
                    [styles['column']]: true,
                    [styles['leftest']]: leftest,
                    [styles['rightest']]: rightest,
                    [styles['is-masked']]: isMasked,
                    [styles['is-filtered']]: filtered,
                    [styles['is-empty-global']]: !globalCount
                })}
                onTouchMove={onBinTouchMove}
                onMouseMove={onBinTouchMove}
                onMouseDown={onBinTouchStart}
                onTouchStart={onBinTouchStart}
                onTouchCancel={onBinTouchCancel}>
                <div
                    style={{ backgroundColor: color || 'transparent' }}
                    className={classNames({
                        [styles['bar-bg']]: true,
                        [styles['bar-rect']]: true,
                        [styles['bar-bg-bg']]: true
                    })}
                />
                <div
                    className={classNames({
                        [styles['bar-bg']]: true,
                        [styles['bar-rect']]: true,
                        [styles['bar-bg-fade']]: true
                    })}
                />
                <div
                    className={classNames({
                        [styles['bar-rect']]: true,
                        [styles['bar-global']]: true
                    })}
                    style={{
                        bottom: 0,
                        height: globalHeight,
                        visibility: globalCount ? 'visible' : 'hidden',
                        backgroundColor: color || '#BBBBBB'
                    }}
                />
                <div
                    className={classNames({
                        [styles['bar-rect']]: true,
                        [styles['bar-masked']]: true
                    })}
                    style={{
                        bottom: 0,
                        height: maskedHeight,
                        visibility: maskedCount ? 'visible' : 'hidden',
                        backgroundColor: color || 'rgb(15, 165, 197)'
                    }}
                />
                <div
                    className={classNames({
                        [styles['bar-bg']]: true,
                        [styles['bar-rect']]: true,
                        [styles['bar-bg-border']]: true
                    })}
                />
            </div>
        </OverlayTrigger>
    );
};

const SparklineBarInfo = ({ values, color, binType, dataType, globalCount, maskedCount }) => {
    const rows = [];

    rows.push([<p key="count-label">COUNT</p>, <p key="count-value">{globalCount}</p>]);

    if (binType === 'countBy') {
        rows.push([
            <p key="value-label">CATEGORY</p>,
            <p
                key="value-value"
                dangerouslySetInnerHTML={{
                    __html: defaultFormat(values[0], dataType)
                }}
            />
        ]);
    } else if (binType === 'histogram') {
        if (values.length === 1) {
            rows.push([
                <p key="value-label">VALUE</p>,
                <p key="value-value">{shortFormat(values[0], dataType)}</p>
            ]);
        } else if (values.length === 2) {
            rows.push([
                <p key="value-label">RANGE</p>,
                <p key="value-value">{values.map(x => shortFormat(x, dataType)).join(' : ')}</p>
            ]);
        }
    }

    if (maskedCount) {
        rows.push([
            <p key="selected-label" style={{ color: '#ff6600' }}>
                SELECTED
            </p>,
            <p key="selected-value" style={{ color: '#ff6600' }}>
                {maskedCount}
            </p>
        ]);
    }

    if (globalCount && color) {
        rows.push([
            <p key="color-label">Color</p>,
            <p key="color-value">
                {color}
                <ColorPill color={color} />
            </p>
        ]);
    }

    return (
        <div className={styles['histogram-info']}>
            <div style={{ textAlign: 'right' }}>{rows.map(row => row[0])}</div>
            <div style={{ textAlign: 'left', marginLeft: 10 }}>{rows.map(row => row[1])}</div>
        </div>
    );
};
