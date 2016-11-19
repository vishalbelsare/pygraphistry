import classNames from 'classnames';
import { shortFormat, defaultFormat } from 'viz-shared/formatters';
import { Popover, OverlayTrigger } from 'react-bootstrap';
import styles from 'viz-shared/components/histograms/styles.less';

export const SparklineBar = ({ index, name, binType, dataType,
                               values = [], isMasked = false,
                               encodings, componentType,
                               maskedCount = 0, maskedHeight = `50%`,
                               globalCount = 0, globalHeight = `100%`,
                               onBinTouchMove, onBinTouchStart, onBinTouchCancel,
                               binWidth = `20px`, enabled = false,
                               filterBounds = { leftest: false, rightest: false } }) => {

    const { leftest, rightest } = filterBounds;

    let color = false;
    try {
        color = encodings[componentType].color.attribute === name ?
            encodings[componentType].color.legend[index] : false;
    } catch (e) {}

    return (
        <OverlayTrigger trigger={['hover']}
                        placement='bottom'
                        overlay={
                <Popover id={`histogram-${name}-tooltip`} style={{ zIndex: 999999999 }}>
                    <SparklineBarInfo values={values}
                                      binType={binType}
                                      dataType={dataType}
                                      globalCount={globalCount}
                                      maskedCount={maskedCount}/>
                </Popover>
            }>
            <div style={{ width: binWidth }}
                 className={classNames({
                    [styles['leftest']]: leftest,
                    [styles['rightest']]: rightest,
                    [styles['is-masked']]: isMasked,
                    [styles['is-filter-true']]: enabled,
                    [styles['is-filter-false']]: !enabled,
                    [styles['histogram-column']]: true
                 })}
                 onTouchMove={onBinTouchMove}
                 onMouseMove={onBinTouchMove}
                 onMouseDown={onBinTouchStart}
                 onTouchStart={onBinTouchStart}
                 onTouchCancel={onBinTouchCancel}>
                <div style={{ backgroundColor: color || 'transparent' }}
                     className={classNames({
                        [styles['bar-bg']]: true,
                        [styles['bar-rect']]: true,
                        [styles['bar-bg-bg']]: true
                     })}/>
                <div className={classNames({
                         [styles['bar-bg']]: true,
                         [styles['bar-rect']]: true,
                         [styles['bar-bg-fade']]: true
                     })}/>
                <div className={classNames({
                         [styles['bar-rect']]: true,
                         [styles['bar-global']]: true
                     })}
                     style={{
                         bottom: 0,
                         height: globalHeight,
                         visibility: globalCount ? 'visible' : 'hidden',
                         backgroundColor: color || '#BBBBBB'
                     }}/>
                <div className={classNames({
                         [styles['bar-rect']]: true,
                         [styles['bar-masked']]: true
                     })}
                     style={{
                         bottom: 0,
                         height: maskedHeight,
                         visibility: maskedCount ? 'visible' : 'hidden',
                         backgroundColor: color || 'rgb(15, 165, 197)',
                     }}/>
            </div>
        </OverlayTrigger>
    );
};

const SparklineBarInfo = ({ values, binType, dataType, globalCount, maskedCount }) => {

    const rows = [];

    rows.push([
        <p>COUNT</p>,
        <p>{globalCount}</p>
    ]);

    if (binType === 'countBy') {
        rows.push([
            <p>CATEGORY</p>,
            <p>{defaultFormat(values[0], dataType)}</p>
        ]);
    } else if (binType === 'histogram') {
        if (values.length === 1) {
            rows.push([
                <p>VALUE</p>,
                <p>{shortFormat(values[0], dataType)}</p>
            ]);
        } else if (values.length === 2) {
            rows.push([
                <p>RANGE</p>,
                <p>{values
                    .map((x) => shortFormat(x, dataType))
                    .join(' : ')}</p>
            ]);
        }
    }

    if (maskedCount) {
        rows.push([
            <p style={{ color: '#ff6600' }}>SELECTED</p>,
            <p style={{ color: '#ff6600' }}>{maskedCount}</p>
        ]);
    }

    return (
        <div className={styles['histogram-info']}>
            <div style={{ textAlign: 'right' }}>
                {rows.map((row) => row[0])}
            </div>
            <div style={{ textAlign: 'left', marginLeft: 10 }}>
                {rows.map((row) => row[1])}
            </div>
        </div>
    );
}
