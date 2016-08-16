import { Observable } from 'rxjs';
import { TableRow } from './TableRow';
import { TableBody } from './TableBody';
import { TableHeader } from './TableHeader';
import { Component, Container } from 'reaxtor';
import { table as tableClassName,
         thead as tableHeaderClassName } from './styles.css';

export class Table extends Component {
    initialize(models, depth) {

        const tBody = new TableBody({
            index: 1, depth: depth + 1,
            models: models.deref(`rows`)
        });

        const tHeadRow = new TableHeader({
            field: 'name', type: 'th',
            index: 0, depth: depth + 1,
            models: models.deref(`cols`),
            onSelectPivot: tBody.dispatch('search-pivot'),
            onInsertRow: tBody.dispatch('insert-row'),
            onSpliceRow: tBody.dispatch('splice-row')
        });

        return models.switchMapTo(
            Observable.combineLatest(tHeadRow, tBody),
            (componentInfo, childVDoms) => [...componentInfo, ...childVDoms]
        );
    }
    render(model, state, tHeadRow, tBody) {
        return (
            <table class_={{ [tableClassName]: true }}
                   style_={{ border: 0, cellpadding: 0, cellspacing: 0 }}>
                <thead class_={{ [tableHeaderClassName]: true }}>
                    {tHeadRow}
                </thead>
                {tBody}
            </table>
        );
    }
}
