import compose from 'recompose/compose';
import investigationSchema from './schema';
import Investigation from './components/investigation';
import InvestigationHeader from './components/investigation-header';
import InvestigationScreen from './components/investigation-screen';
import { investigationContainer, investigationScreenContainer } from './containers';

const InvestigationScreenContainer = investigationScreenContainer(InvestigationScreen);
const InvestigationContainer = compose(
    investigationSchema, investigationContainer
)(Investigation);

export { InvestigationContainer as Investigation };
export { InvestigationHeader as InvestigationHeader };
export { InvestigationScreenContainer as InvestigationScreen };
export { default as InvestigationTable } from './components/investigation-table';
