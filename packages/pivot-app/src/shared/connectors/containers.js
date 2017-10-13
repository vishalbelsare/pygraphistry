import { Connector } from 'pivot-shared/connectors';
import { container } from '@graphistry/falcor-react-redux';
import { checkStatus } from 'pivot-shared/actions/connectorScreen';

export const connectorContainer = container({
    renderLoading: false,
    fragment: () => `{
        id, name, status, lastUpdated
    }`,
    dispatchers: {
        checkStatus
    }
});

export const connectorScreenContainer = container({
    renderLoading: false,
    fragment: ({ connectors } = {}) => `{
        id, name, activeScreen, connectors: ${Connector.fragments(connectors)}
    }`
});
