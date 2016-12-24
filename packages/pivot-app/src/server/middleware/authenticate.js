import passport from 'passport';
import { BasicStrategy } from 'passport-http';
import { compare } from 'bcrypt';
import conf from '../config.js';
import logger from '../../shared/logger.js';
const log = logger.createLogger(__filename);



export function authenticateMiddleware() {
    if(!conf.get('authentication.passwordHash')) {

        return function authenticationDisabledMiddleware(req, res, next) {
            req.user = { username: 'admin' };
            return next();
        }
    } else {
        log.info('Authentication is enabled');
        passport.use(new BasicStrategy(checkLoginCredentials));
        return passport.authenticate('basic', { session: false });
    }
}


// Called by the Passport strategy to check if a given username+password is valid
function checkLoginCredentials(providedUsername, providedPassword, authResultsCb) {
    const authorizedUsername = 'admin';
    const authorizedPassword = conf.get('authentication.passwordHash');

    compare(providedPassword, authorizedPassword,
        (bcryptErr, isPasswordEqualToHash) => {
            if(bcryptErr) {
                return authResultsCb(bcryptErr, null);
            }

            if(providedUsername !== authorizedUsername) {
                // Invalid username; reject authentication attempt
                return authResultsCb(null, false);
            } else if(!isPasswordEqualToHash) {
                // invalid password; reject authentication attempt
                return authResultsCb(null, false);
            } else {
                // Only if the username and password are valid, call passport's
                // callback, passing (truthy) user info as the second arg
                return authResultsCb(null, { username: providedUsername });
            }
        }
    );
}
