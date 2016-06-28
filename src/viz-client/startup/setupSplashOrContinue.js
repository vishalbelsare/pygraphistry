import $ from 'jquery';
import { bind } from 'lodash';
import { Observable } from '@graphistry/rxjs';

export function setupSplashOrContinue(body, options) {

    const { client = 'main', splashAfter } = options;
    const showSplash = !(
        client !== 'main' ||
        typeof splashAfter === 'undefined' ||
        Date.now() / 1000 <= splashAfter
    );

    if (showSplash) {

        const $splash = $(`
            <div class='splash'>
                <img src='img/logowhite.png'></img>
                <span>
                    <a href='javascript:void(0)' id='go-load'>
                        Launch Visualization
                    </a>
                </span>
            </div>`)
            .prependTo(body);

        const fadeOut = Observable.bindCallback(
            bind($splash.fadeOut, $splash),
            function(x) {
                $(this).empty();
                return options;
            }
        );

        return Observable
            .fromEvent($splash, 'click', () => fadeOut(100))
            .mergeAll();
    }

    return Observable.of(options);
}
