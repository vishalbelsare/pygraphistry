import compose from 'recompose/compose';
import pivotSchema from './schema';
import PivotRow from './components/pivot-row';
import PivotRowHeader from './components/pivot-row-header'
import { pivotContainer } from './containers';

const PivotRowHeaderContainer = pivotContainer(PivotRowHeader);

const PivotContainer = compose(
    pivotSchema, pivotContainer
)(PivotRow);

export { PivotContainer as Pivot };
export { PivotContainer as PivotRow };
export { PivotRowHeaderContainer as PivotRowHeader };
export { default as PivotTable } from './components/pivot-table';
