import PivotCell from './pivot-cell';
import PivotActions from './pivot-actions';
import EntitySummaries from './entity-summaries';
import styles from './pivots.less';
import { PanelGroup, Panel } from 'react-bootstrap';

class PivotPanel extends Panel {
    constructor(...args) {
        super(...args)
        this.state = {
            open: true
        };
    }

    makeHeader(header, expanded) {
        const icon = expanded ? 'fa fa-fw fa-minus' : 'fa fa-fw fa-plus';
        return (
            <span className={styles['pivot-expander']}>
                <i style={{float: 'right'}} className={`${icon}`} />
                <span style={{padding: '0.25em'}}> { header } </span>
            </span>
        )
    }

    render() {
        const header = this.makeHeader(this.props.header, this.state.open);
        return (
            <Panel collapsible
                {...this.props} 
                header={header} 
                expanded={this.state.open}
                onSelect={() => this.setState({ open: !this.state.open })}
            />
        )
    }
}

function ParameterPanel({id, pivotTemplate, pivotParameters, pivots, handlers, rowIndex}) {
    const previousPivots = pivots.slice(0, rowIndex);
    return (
        <PivotPanel header={'Parameters'} eventKey='1' >
            <div className={styles['pivot-expander-body']}>
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
            </div>
        </PivotPanel>
    )
}

//function QueryOutputPanel() {
    //return (
        //<PivotPanel header={'Splunk Query'} eventKey='2' >
            //<div className={styles['splunk-query']}><Well bsSize='sm'> 'This is not a real splunk query! Implement me please!' </Well></div>
        //</PivotPanel>
    //)
//}

function ResultSummaryPanel({id, enabled, resultSummary, resultCount}) {
    return (
        <PivotPanel header={"Result Summary"} eventKey='3'>
            <div className={styles['pivot-expander-body']}>
                {resultCount ?
                        <div className={`${styles['pivot-result-summaries']} ${styles['result-count-' + (enabled ? 'on' : 'off')]}`}>
                        {
                            resultSummary &&
                                <EntitySummaries id={id} resultSummary={resultSummary}/>
                                || null
                        }
                    </div>
                        : <b>{ 'Run query to select events' }</b>}


                    </div>
                </PivotPanel>
    )
}

export default function PivotRow({
    id, investigationId, status,
    enabled, resultCount, resultSummary,
    pivotParameters, pivotTemplate,
    searchPivot, togglePivots, setPivotAttributes,
    splicePivot, insertPivot, pivots, rowIndex
}) {

    const handlers = {searchPivot, togglePivots, setPivotAttributes, splicePivot, insertPivot};

    return (
        <div id={"pivotRow" + id} className={`${styles['pivot-row']} ${styles['pivot-checked-' + Boolean(enabled)]}`}>
            <PanelGroup>
                <ParameterPanel 
                    id={id} 
                    pivotTemplate={pivotTemplate} 
                    pivots={pivots} 
                    handlers={handlers} 
                    rowIndex={rowIndex}
                    pivotParameters={pivotParameters}
                />
                { /*
                        //TODO implement output query 
                <QueryOutputPanel/>
                */
                }
                <ResultSummaryPanel
                    id={id}
                    enabled={enabled}
                    resultSummary={resultSummary}
                    resultCount={resultCount}
                    rowIndex={rowIndex}
                />
            </PanelGroup>
            <div className={styles['pivot-icons']}>
                <PivotActions 
                    investigationId={investigationId} 
                    index={rowIndex} 
                    resultCount={resultCount} 
                    searchPivot={searchPivot}
                    insertPivot={insertPivot}
                    splicePivot={splicePivot}
                    status={status}
                    numRows={pivots.length}
                />
            </div>
        </div>
    );
}
