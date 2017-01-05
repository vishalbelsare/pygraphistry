import compose from 'recompose/compose';
import pivotSchema from './schema';
import PivotRow from './components/pivot-row';
import { pivotContainer } from './containers';

const PivotContainer = compose(
    pivotSchema, pivotContainer
)(PivotRow);

export { PivotContainer as Pivot };
export { PivotContainer as PivotRow };
export { default as PivotTable } from './components/pivot-table';
