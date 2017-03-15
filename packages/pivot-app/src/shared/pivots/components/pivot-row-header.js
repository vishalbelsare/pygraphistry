import styles from './pivots.less'
import TemplateSelector from './template-selector';
import RcSwitch from 'rc-switch';

export default function PivotRowHeader({ id, investigationId, enabled, rowIndex, pivots, templates, 
    togglePivots, pivotTemplate, setPivotAttributes
}) {
    return (
        <div className={styles['pivot-row-header']}>
            { rowIndex + 1 }
            <span className={styles['pivot-row-header-item']}>
                <RcSwitch 
                    defaultChecked={false}
                    checked={enabled}
                    checkedChildren={'On'}
                    onChange={(enabled) => {
                        const indices = enabled ? _.range(0, rowIndex + 1)
                            : _.range(rowIndex, pivots.length);
                        togglePivots({indices, enabled, investigationId});
                    }}
                    unCheckedChildren={'Off'}
                />
            </span>

            {
                pivotTemplate && templates &&
                    <span 
                        style={{width: '80%', display:'inline-flex'}}
                        className={styles['pivot-row-header-item']}
                    >
                        <TemplateSelector
                            id={id}
                            templates={templates}
                            pivotTemplate={pivotTemplate}
                            setPivotAttributes={setPivotAttributes}
                        />
                    </span>
                    || undefined
            }
        </div>
    )
}
