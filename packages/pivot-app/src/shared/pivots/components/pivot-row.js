import _ from 'underscore';
import RcSwitch from 'rc-switch';
import PivotCell from './pivot-cell';
import PivotActions from './pivot-actions';
import EntitySummaries from './entity-summaries';
import TemplateSelector from './template-selector';
import styles from 'pivot-shared/styles.less';
import { Badge, Tooltip, OverlayTrigger, Accordion, PanelGroup, Panel } from 'react-bootstrap';

export default function PivotRow({
    id, investigationId, status,
    enabled, resultCount, resultSummary,
    pivotParameters, pivotTemplate, templates,
    searchPivot, togglePivots, setPivotAttributes,
    splicePivot, insertPivot, pivots, rowIndex
}) {

    const handlers = {searchPivot, togglePivots, setPivotAttributes, splicePivot, insertPivot};

    const previousPivots = pivots.slice(0, rowIndex);

    return (
        <div id={"pivotRow" + id} className={styles['pivot-row']}>
            

                <div className={styles['pivot-row-header']}>
                    <span className={styles['pivot-number']}>{ rowIndex }</span>
                    <RcSwitch defaultChecked={false}
                              checked={enabled}
                              checkedChildren={'On'}
                              onChange={(enabled) => {
                                  const indices = enabled ? _.range(0, rowIndex + 1)
                                                          : _.range(rowIndex, pivots.length);
                                  togglePivots({indices, enabled, investigationId});
                              }}
                              unCheckedChildren={'Off'}
                    />

                    {
                        pivotTemplate && templates &&
                        <TemplateSelector id={id}
                                          templates={templates}
                                          pivotTemplate={pivotTemplate}
                                          setPivotAttributes={setPivotAttributes}/>
                        || undefined
                    }
                </div>
                <Accordion><Panel header="↓" eventKey='1'>

                    <div>

                        {
                            pivotTemplate && pivotTemplate.pivotParameterKeys && pivotTemplate.pivotParametersUI &&
                            pivotTemplate.pivotParameterKeys.map((key, index) =>
                                <PivotCell id={id}
                                           paramKey={key}
                                           handlers={handlers}
                                           key={`${id}:${key}:${index}`}
                                           previousPivots={previousPivots}
                                           paramValue={pivotParameters[key]}
                                           paramUI={pivotTemplate.pivotParametersUI[key]}/>
                            )
                        }
                
                    </div>

                    {resultCount ?
                    <div className={styles.pivotResultSummaries + ' ' + styles['result-count-' + (enabled ? 'on' : 'off')]}>
                        <OverlayTrigger placement="top" overlay={
                            <Tooltip id={`resultCountTip_${id}_${rowIndex}`}>Events</Tooltip>
                        } key={`${rowIndex}: entitySummary_${id}`}>
                            <Badge> {resultCount} </Badge>
                        </OverlayTrigger>
                        {
                            resultSummary &&
                            <EntitySummaries id={id} resultSummary={resultSummary}/>
                            || undefined
                        }
                    </div>
                    : null}

                    <div className={styles.pivotIcons}>
                        <PivotActions investigationId={investigationId} index={rowIndex} resultCount={resultCount} searchPivot={searchPivot}
                            insertPivot={insertPivot} splicePivot={splicePivot} status={status} numRows={pivots.length}/>
                    </div>

                </Panel></Accordion>
            
        </div>
    );
}
