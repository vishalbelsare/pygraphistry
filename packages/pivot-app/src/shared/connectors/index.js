import compose from 'recompose/compose';
import connectorSchema from './schema';
import ConnectorRow from './components/connector-row';
import ConnectorScreen from './components/connector-screen';
import { connectorContainer, connectorScreenContainer } from './containers';

const ConnectorScreenContainer = connectorScreenContainer(ConnectorScreen);
const ConnectorContainer = compose(connectorSchema, connectorContainer)(ConnectorRow);

export { ConnectorContainer as Connector };
export { ConnectorContainer as ConnectorRow };
export { ConnectorScreenContainer as ConnectorScreen };
