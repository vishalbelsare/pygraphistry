import { Observable } from 'rxjs';
import { MongoClient } from 'mongodb';

export function connectToMongo({ config, mongoConnectOptions = { autoReconnect: true } }) {
  const connectToMongo = Observable.bindNodeCallback(MongoClient.connect.bind(MongoClient));

  // Connect to the Mongo server
  return (
    connectToMongo(config.MONGO_SERVER, mongoConnectOptions)
      // If there's an error connecting to the Mongo server, communicate it to
      // the parent process without exiting.
      .catch(catchConnectionError)
      // If we successfully connect to the Mongo server, attempt to connect to
      // the database. If there's an error connecting to the database,
      // communicate it to the parent process without exiting.
      .map(mapServerToDatabase)
  );

  function catchConnectionError(err) {
    return Observable.throw({
      err,
      shouldExit: true,
      message: 'Could not connect to Mongo.'
    });
  }

  function mapServerToDatabase(mongoServer) {
    try {
      return mongoServer.db(config.DATABASE);
    } catch (err) {
      throw {
        err,
        shouldExit: true,
        message: 'Could not setup Mongo/pings.'
      };
    }
  }
}
