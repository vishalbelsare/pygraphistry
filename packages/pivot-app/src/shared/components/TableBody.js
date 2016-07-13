import { Container } from 'reaxtor';
import { TableRow } from './TableRow';
import { tbody as tableBodyClassName } from './styles.css';

export class TableBody extends Container {
    loadProps(model) {
        return model.getItems(
            () => `['length']`,
            ({ json: { length }}) => !length ? [] : [
                [{ length }, ['length']]
            ]
        );
    }
    createChild(props) {
        return new TableRow({
            ...props, field: 'value',
            onInsertRow: this.dispatch('insert-row'),
            onSpliceRow: this.dispatch('splice-row')
        });
    }
    loadState(model, props) {

        const inserts = this.listen('insert-row').switchMap((id) => (
            model.call('insert', [id])
        ));
        const splices = this.listen('splice-row').switchMap((id) => (
            model.call('splice', [id])
        ));

        return inserts.merge(splices).ignoreElements();
    }
    render(model, state, ...rows) {
        return (
            <tbody class_={{ [tableBodyClassName]: true }}>
                {rows}
            </tbody>
        );
    }
}

