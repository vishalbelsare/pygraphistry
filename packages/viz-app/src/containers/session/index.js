import compose from 'recompose/compose';
// import sessionSchema from './schema';
import { Session } from './components';
import { sessionContainer } from './containers';

const SessionContainer = compose(/*sessionSchema, */ sessionContainer)(Session);

export { SessionContainer as Session };
