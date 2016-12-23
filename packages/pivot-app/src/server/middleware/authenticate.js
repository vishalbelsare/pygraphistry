import passport from 'passport';
import { BasicStrategy } from 'passport-http';
import { compare } from 'bcrypt';
import conf from '../config.js';

const globalUsername = 'admin';

export function authenticateMiddleware() {
    if(conf.get('auth.password') === undefined || conf.get('auth.password') === '') {
        return function noopMiddleware(req, res, next) {
            req.user = { username: 'guest' };
            return next();
        }
    } else {
        passport.use(new BasicStrategy(
            function(username, password, cb) {
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
