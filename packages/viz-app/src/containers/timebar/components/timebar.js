import React from 'react';
import styles from './styles.less';
import Timebar from '@graphistry/timebar';
import { defaultFormat } from '../../../formatters/defaultFormat';

export const TimebarItem = h => <div>Timebar item: {JSON.stringify(h)}</div>;

export const TimebarHistogram = ({ timebarHisto }) =>
    !timebarHisto.global || !timebarHisto.global.bins ? (
        <div className={styles['timebar']} title={JSON.stringify(timebarHisto)}>
            Just living in the present...
        </div>
    ) : (
        <div className={styles['timebar']} title={JSON.stringify(timebarHisto)}>
            <Timebar
                width={600}
                height={120}
                bins={timebarHisto.global.bins.map(item => {
                    const values = item.values.map(v => {
                        const date = defaultFormat(v, 'date');
                        console.log(`Turned ${item.count} items from ${v} into ${date}`);
                        return date;
                    });
                    return { count: item.count, values };
                })}
                onHighlight={bin => {
                    console.log('Highlighted Bin:', bin, '(you should wire me up to renderer!)');
                }}
                setSelection={selection => {
                    console.log('Selection:', selection, '(DO SOMETHING WITH THIS!)');
                }}
            />
        </div>
    );
