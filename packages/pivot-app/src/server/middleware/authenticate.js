import passport from 'passport';
import { BasicStrategy } from 'passport-http';
import { compare } from 'bcrypt';
import conf from '../config.js';
import logger from '../../shared/logger.js';
const log = logger.createLogger(__filename);


export function authenticateMiddleware() {
    const globalUsername = 'admin';

    if(conf.get('auth.password') === undefined || conf.get('auth.password') === '') {
        log.info('Authentication is disabled');

        return function noopMiddleware(req, res, next) {
            req.user = { username: globalUsername };
            return next();
        }
    } else {
        log.info('Authentication is enabled');

        passport.use(new BasicStrategy(
            function(username, password, cb) {
                log.info(`Authenticating user ${username}`);

                if(username !== globalUsername) {
                    return cb(null, false);
                }

                return compare(password, conf.get('auth.password'))
                    .then(
                        function(passwordValid) {
                            if(!passwordValid) { return cb(null, false); }
                            return cb(null, {username: globalUsername});
                        },
                        function(err) {
                            return cb(err);
                        }
                    );
            })
        );

        return passport.authenticate('basic', { session: false });
    }
}
