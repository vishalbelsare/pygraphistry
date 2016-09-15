import { getDataSourceFactory } from 'viz-shared/middleware';

export function socketRoutes(services, socket) {
    const getDataSource = getDataSourceFactory(services);
    return ([{
        event: 'falcor-request',
        handler: falcorSocketRequestHandler(getDataSource, socket)
    }]);
}

function falcorSocketRequestHandler(getDataSource, socket) {

    const { handshake: { query = {} }} = socket;

    return function onEvent({ id, args, functionPath, jsonGraphEnvelope, method, pathSets, refSuffixes, thisPaths }) {

        let parameters = [];

        if (method === "call") {
            parameters = [functionPath, args, refSuffixes, thisPaths];
        } else if (method === "get") {
            parameters = [pathSets];
        } else if (method === "set") {
            parameters = [jsonGraphEnvelope];
        } else {
            throw new Error(`${method} is not a valid method`);
        }

        const responseToken = `falcor-request_${id}`;
        const cancellationToken = `cancel-falcor-request_${id}`;

        let results = null;
        let operationIsDone = false;
        let handleCancellationForId = null;

        const Router = getDataSource({ query });
        const operation = Router[method](...parameters).subscribe(
            (data) => {
                results = data;
            },
            (error) => {
                operationIsDone = true;
                if (handleCancellationForId !== null) {
                    socket.removeListener(cancellationToken, handleCancellationForId);
                }
                socket.emit(responseToken, { error, ...results });
            },
            () => {
                operationIsDone = true;
                if (handleCancellationForId !== null) {
                    socket.removeListener(cancellationToken, handleCancellationForId);
                }
                socket.emit(responseToken, { ...results });
            }
        );

        if (!operationIsDone) {
            socket.on(
                cancellationToken,
                handleCancellationForId = function() {
                    if (operationIsDone === true) {
                        return;
                    }
                    operationIsDone = true;
                    socket.removeListener(cancellationToken, handleCancellationForId);
                    if (typeof operation.dispose === "function") {
                        operation.dispose();
                    } else if (typeof operation.unsubscribe === "function") {
                        operation.unsubscribe();
                    }
                }
            );
        }
    }
}
