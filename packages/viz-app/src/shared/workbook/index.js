import withWorkbookSchema from './schema';
import compose from 'recompose/compose';
import Workbook from './components/workbook';
import { withWorkbookContainer } from './containers';

const WorkbookContainer = compose(
    withWorkbookSchema, withWorkbookContainer
)(Workbook);

export { WorkbookContainer as Workbook };
export default WorkbookContainer;
