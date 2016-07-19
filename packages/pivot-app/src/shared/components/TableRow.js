import { Container } from 'reaxtor';
import { TableCell } from './TableCell';
import { tcell as tableCellClassName,
         splice as spliceIconClassName,
         insert as insertIconClassName } from './styles.css';

export class TableRow extends Container {
    loadProps(model) {
        return model.getItems(
            () => `['id', 'length']`,
            ({ json: { length }}) => !length ? [] : [
                [{ length }, this.field]
            ]
        );
    }
    createChild(props) {
        const cellType = this.type === 'th' ? 'text' : 'number';
        return new TableCell({
            ...props, field: this.field, type: cellType
        });
    }
    render(model, { id, length = 0 }, ...cellVDoms) {

        const rowType = this.type || 'td';
        const cellWidth = Math.round(100 / (length + 1));

        const createTableCell = (cellVDom) => {
            return (rowType === 'td') ? (
                <td style_={{ width: `${cellWidth}%` }}>{cellVDom}</td>) : (
                <th style_={{ width: `${cellWidth}%` }}>{cellVDom}</th>);
        };

        const tableCellVDoms = cellVDoms.concat(
                <div class_={{ [tableCellClassName]: true }}>
                    <i on-click={[this.onSpliceRow, id]} class_={{ [spliceIconClassName]: true }}/>
                    <i on-click={[this.onInsertRow, id]} class_={{ [insertIconClassName]: true }}/>
                </div>
            )
            .map(createTableCell);

        return (<tr>{tableCellVDoms}</tr>);
    }
}

