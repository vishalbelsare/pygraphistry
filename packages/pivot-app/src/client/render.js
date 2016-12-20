import { init } from 'snabbdom';
import snabbdomClass from 'snabbdom/modules/class';
import snabbdomProps from 'snabbdom/modules/props';
import snabbdomStyle from 'snabbdom/modules/style';
import snabbdomAttributes from 'snabbdom/modules/attributes';
import snabbdomEventlisteners from 'snabbdom/modules/eventlisteners';

const patchDOM = init([
    snabbdomClass,
    snabbdomProps, snabbdomStyle,
    snabbdomAttributes, snabbdomEventlisteners
]);

export function render(dom, [model, vdom]) { // eslint-disable-line no-unused-vars
    return patchDOM(dom, vdom);
}
