import RcSwitch from 'rc-switch';
import styles from './pivots.less';
import classNames from 'classnames';
import TemplateSelector from './template-selector';
import { Grid, Row, Col } from 'react-bootstrap';

export default function PivotRowHeader({ id, investigationId, enabled, rowIndex, pivots, templates,
    togglePivots, pivotTemplate, setPivotAttributes
}) {
    return (
        <Grid fluid className={styles['pivot-row-header']}>
            <Row>
                <Col xs={3} sm={3} md={3} lg={3} className={styles['pivot-row-header-item']}>
                    <span data-row-index={rowIndex + 1} className={classNames({
                        [styles.disabled]: !enabled,
                        [styles['pivot-row-index-flag']]: true
                    })}/>
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
                </Col>
                <Col xs={9} sm={9} md={9} lg={9}
                     className={styles['pivot-row-header-item']}
                     style={{ marginRight: -10, paddingRight: 5 }}>
                    {pivotTemplate && templates &&
                        <TemplateSelector
                            id={id}
                            templates={templates}
                            pivotTemplate={pivotTemplate}
                            setPivotAttributes={setPivotAttributes}
                        />
                        || undefined
                    }
                </Col>
            </Row>
        </Grid>
    );
}
