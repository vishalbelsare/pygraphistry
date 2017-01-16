import _ from 'underscore';
import RcSwitch from 'rc-switch';
import PivotCell from './pivot-cell';
import PivotActions from './pivot-actions';
import EntitySummaries from './entity-summaries';
import TemplateSelector from './template-selector';
import styles from './pivots.less';
import { Badge, Tooltip, OverlayTrigger } from 'react-bootstrap';
import { Accordion, AccordionItem } from 'react-sanfona';

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
        <div id={"pivotRow" + id} className={`${styles['pivot-row']} ${styles['pivot-checked-' + Boolean(enabled)]}`}>            

                <div className={styles['pivot-row-header']}>
                    <span className={styles['pivot-row-header-item']}>
                        <span className={styles['pivot-number']}>{ rowIndex }</span>
                    </span>
                    <span className={styles['pivot-row-header-item']}>
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
                    </span>

                    {
                        pivotTemplate && templates &&
                        <span className={styles['pivot-row-header-item']}><TemplateSelector id={id}
                                          templates={templates}
                                          pivotTemplate={pivotTemplate}
                                          setPivotAttributes={setPivotAttributes}/></span>
                        || undefined
                    }
                </div>
                <Accordion><AccordionItem
                        title={
                            <span className={styles['pivot-expander']}>
                                <i className={`fa fa-fw fa-caret-down ${styles['pivot-expander-open']}`} />
                                <i className={`fa fa-fw fa-caret-right ${styles['pivot-expander-closed']}`} />
                            </span>
                        }                        
                    ><div className={styles['pivot-expander-body']}>

                    <div className={styles['pivot-params']}>

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
                    <div className={`${styles['pivot-result-summaries']} ${styles['result-count-' + (enabled ? 'on' : 'off')]}`}>
                        <label>Events: </label>

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

                    <div className={styles['pivot-icons']}>
                        <PivotActions investigationId={investigationId} index={rowIndex} resultCount={resultCount} searchPivot={searchPivot}
                            insertPivot={insertPivot} splicePivot={splicePivot} status={status} numRows={pivots.length}/>
                    </div>

                </div></AccordionItem></Accordion>
            
        </div>
    );
}
