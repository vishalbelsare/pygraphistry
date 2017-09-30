import passport from 'passport';
import { BasicStrategy } from 'passport-http';
import { compare } from 'bcrypt';

import { createLogger } from 'pivot-shared/logger';
const log = createLogger(__filename);

// The userId to use for all users, until we get a more sophisticated account system
const defaultUserId = 0;

export function authenticateMiddleware(convict) {
    if(!convict.get('authentication.passwordHash')) {
        log.warn(`Authentication disabled because "authentication.passwordHash" is not set in your config. Anybody will be able to access this service without restriction.`);

        return noAuthMiddleware(convict);
    } else {
        passport.use(new BasicStrategy(checkLoginCredentialsMiddleware(convict)));
        return passport.authenticate('basic', { session: false });
    }
}

// Called by the Passport strategy to check if a given username+password is valid
function checkLoginCredentialsMiddleware(convict) {
    return function checkLoginCredentialsMiddlewareHandler(providedUsername, providedPassword, authResultsCb) {
        const authorizedUsername = convict.get('authentication.username');
        const authorizedPassword = convict.get('authentication.passwordHash');

        compare(providedPassword, authorizedPassword,
            (bcryptErr, isPasswordEqualToHash) => {
                if(bcryptErr) {
                    log.error({err: bcryptErr}, `Error while comparing plaintext password (in authentication request for username "${providedUsername}") to the configured hashed password (in config entry 'authentication.passwordHash')`);
                    return authResultsCb(bcryptErr, null);
                }

                if(providedUsername !== authorizedUsername) {
                    // Invalid username; reject authentication attempt
                    log.warn(`Rejecting authentication attempt: invalid username "${providedUsername}"`);
                    return authResultsCb(null, false);
                } else if(!isPasswordEqualToHash) {
                    // invalid password; reject authentication attempt
                    log.warn(`Rejecting authentication attempt: invalid password for username "${providedUsername}"`);
                    return authResultsCb(null, false);
                } else {
                    // Only if the username and password are valid, call passport's
                    // callback, passing (truthy) user info as the second arg
                    log.debug(`Successfully authenticated credentials for username "${providedUsername}"`);
                    return authResultsCb(null, {
                        username: providedUsername,
                        userId: defaultUserId
                    });
                }
            }
        );
    }
}

// Middleware that allows all requests, setting the `req.user` field to default values
function noAuthMiddleware(convict) {
    return function noAuthMiddlewareHandler(req, res, next) {
        req.user = {
            username: convict.get('authentication.username'),
            userId: defaultUserId
        };
        return next();
    }
}