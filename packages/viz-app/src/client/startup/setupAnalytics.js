export function setupAnalytics(window, options) {

    const { usertag } = options;
    const { ga = null } = window;

    if (ga && typeof ga === 'function') {
        ga('create', 'UA-59712214-1', 'auto');
        ga('require', 'linkid', 'linkid.js');
        ga('send', 'pageview');
        if (usertag !== undefined && usertag !== '') {
            ga('set', 'userId', usertag);
        }
    }

    return options;
}
