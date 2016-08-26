import { Observable } from 'rxjs';
import { TableBody } from './TableBody';
import { TableHeader } from './TableHeader';
import { InvestigationList } from './InvestigationList';
import { Component } from 'reaxtor';
import { table as tableClassName,
         thead as tableHeaderClassName } from './styles.css';

export class Table extends Component {
    initialize(models, depth) {

        const tBody = new TableBody({
            index: 0, depth: depth + 1,
            models: models.deref(`pivots`)
        });

        const tHeadRow = new TableHeader({
            field: 'name', type: 'th',
            index: 1, depth: depth + 1,
            models: models.deref(`cols`),
            onSelectPivot: tBody.dispatch('search-pivot'),
            onInsertRow: tBody.dispatch('insert-row'),
            onSpliceRow: tBody.dispatch('splice-row')
        });

        const investigationList = new InvestigationList({
            field: 'name', type: 'th',
            index: 2, depth: depth + 1,
            models: models.deref(`investigations`),
        });

        return models.switchMapTo(
            Observable.combineLatest(tHeadRow, tBody, investigationList),
            (componentInfo, childVDoms) => [...componentInfo, ...childVDoms]
        );
    }
    render(model, state, tHeadRow, tBody, investigationList) {
        return (
            <table class_={{ [tableClassName]: true }}
                   style_={{ border: 0, cellpadding: 0, cellspacing: 0 }}>
                <thead class_={{ [tableHeaderClassName]: true }}>
                    {tHeadRow}
                    {investigationList}
                </thead>
                {tBody}
            </table>
        );
    }
}
