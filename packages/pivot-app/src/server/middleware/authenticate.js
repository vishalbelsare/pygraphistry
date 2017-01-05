import passport from 'passport';
import { BasicStrategy } from 'passport-http';
import { compare } from 'bcrypt';
import conf from '../config.js';
import logger from '../../shared/logger.js';
const log = logger.createLogger(__filename);


const globalUsername = 'admin';
const globalUser = {
    userId: '0',
    username: globalUsername,
};

export function authenticateMiddleware() {
    if(conf.get('auth.password') === undefined || conf.get('auth.password') === '') {
        log.info('Authentication is disabled');

        return noopMiddleware;
    } else {
        log.info('Authentication is enabled');

        passport.use(new BasicStrategy(passwordAuth));
        return passport.authenticate('basic', { session: false });
    }
}

function passwordAuth(username, password, cb) {
    log.info(`Authenticating user ${username}`);

    if(username !== globalUsername) {
        return cb(null, false);
    }

    return compare(password, conf.get('auth.password'))
        .then(
            function(passwordValid) {
                if(!passwordValid) {
                    return cb(null, false);
                }
                return cb(null, globalUser);
            },
            function(err) {
                return cb(err);
            }
        );
}

function noopMiddleware(req, res, next) {
    req.user = globalUser;
    return next();
}
