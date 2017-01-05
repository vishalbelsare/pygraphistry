import _ from 'underscore';
import RcSwitch from 'rc-switch';
import PivotCell from './pivot-cell';
import PivotActions from './pivot-actions';
import EntitySummaries from './entity-summaries';
import TemplateSelector from './template-selector';
import styles from 'pivot-shared/styles.less';
import { Badge, Tooltip, OverlayTrigger } from 'react-bootstrap';

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
        <tr id={"pivotRow" + id} className={styles['row-toggled-' + (enabled ? 'on' : 'off')]}>
            <td className={styles.pivotToggle}>
                <span>{ rowIndex }</span>
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
            </td>
            <td key={`pcell-${id}-pivotselector`} className={styles.pivotData0 + ' pivotTypeSelector'}>
                {
                    pivotTemplate && templates &&
                    <TemplateSelector id={id}
                                      templates={templates}
                                      pivotTemplate={pivotTemplate}
                                      setPivotAttributes={setPivotAttributes}/>
                    || undefined
                }
            </td>
            <td key={`pcell-${id}-pivotparam`} className={styles.pivotData1}>
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
            </td>
            <td className={styles.pivotResultCount}>
                <OverlayTrigger placement="top" overlay={
                    <Tooltip id={`resultCountTip_${id}_${rowIndex}`}>Events</Tooltip>
                } key={`${rowIndex}: entitySummary_${id}`}>
                    <Badge> {resultCount} </Badge>
                </OverlayTrigger>
            </td>
            <td className={styles.pivotResultSummaries + ' ' + styles['result-count-' + (enabled ? 'on' : 'off')]}>
            {
                resultSummary &&
                <EntitySummaries id={id} resultSummary={resultSummary}/>
                || undefined
            }
            </td>
            <td className={styles.pivotIcons}>
                <PivotActions investigationId={investigationId} index={rowIndex} resultCount={resultCount} searchPivot={searchPivot}
                    insertPivot={insertPivot} splicePivot={splicePivot} status={status} numRows={pivots.length}/>
            </td>
        </tr>
    );
}
