import $ from 'jquery';

export function setupDocumentElement(document, options) {

    const $html = $(document.documentElement);
    const $beta = $html.find('.beta');
    const { info, debug, beta, logo, menu } = options;

    // URL info parameter can ???
    if (info) {
        $html.addClass('info');
    }

    // URL debug parameter can ???
    if (debug) {
        $html.addClass('debug');
    }

    // Removes beta class from elements
    if (beta) {
        $beta.removeClass('beta');
    }

    // URL logo parameter can disable the logo via CSS
    if (logo === false) {
        $html.addClass('nologo');
    }

    // URL menu parameter can disable the menu/marquee entirely via CSS
    if (menu === false) {
        $html.addClass('nomenu');
    }

    return options;
}
