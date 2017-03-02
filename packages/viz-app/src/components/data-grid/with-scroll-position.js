import { Observable } from 'rxjs/Observable';
import * as Scheduler from 'rxjs/scheduler/animationFrame';
import hoistStatics from 'recompose/hoistStatics';
import compose from 'recompose/compose';
import shallowEqual from 'recompose/shallowEqual';
import mapPropsStream from 'recompose/mapPropsStream';
import createEventHandler from 'recompose/createEventHandler';

function preventDefault(e) {
    e.preventDefault && e.preventDefault();
    e.stopPropagation && e.stopPropagation();
    e.stopImmediatePropagation && e.stopImmediatePropagation();
}

export function WithScrollPosition(Component) {
    return hoistStatics(EnhanceWithScrollPosition)(Component);
}

const EnhanceWithScrollPosition = mapPropsStream((props) => {

    const { stream: pages, handler: onPage } = createEventHandler();
    const { stream: wheels, handler: onWheel } = createEventHandler();
    const { stream: scrolls, handler: onScroll } = createEventHandler();

    const scrollPosition = scrolls
        .map(({ target }) => target)
        .auditTime(0, Scheduler.animationFrame)
        .merge(pages, wheels.do(preventDefault))
        .withLatestFrom(props)
        .startWith({ scrollTop: 0, scrollLeft: 0,
                     offsetWidth: 0, offsetHeight: 0,
                     scrollWidth: Infinity, scrollHeight: Infinity })
        .scan(scanScrollPosition)
        .distinctUntilChanged(shallowEqual);

    return props.combineLatest(scrollPosition, (props, { scrollLeft, scrollTop }) => ({
        ...props, onPage, onWheel, onScroll, scrollTop, scrollLeft
    }));
});

function scanScrollPosition(memo, [eventPageOrTarget, props]) {

    let page, target;
    let { scrollLeft, scrollTop,
          scrollWidth, scrollHeight,
          offsetWidth, offsetHeight } = memo;

    const { height, rowHeight, colHeaderWidth, rowHeaderHeight } = props;

    if (typeof eventPageOrTarget === 'number') {
        page = eventPageOrTarget;
        scrollTop = page === 1 ? 0 : (page - 1) * (
            (rowHeight * /* rowsPerPage */ Math.floor(
                    (height - rowHeaderHeight) / rowHeight)))
    } else {

        if (!(target = eventPageOrTarget.currentTarget)) {
            target = eventPageOrTarget;
            scrollTop = target.scrollTop;
            if ((scrollLeft = target.scrollLeft) === undefined) {
                scrollLeft = memo.scrollLeft;
            }
        } else {
            scrollTop += eventPageOrTarget.deltaY;
            scrollLeft += eventPageOrTarget.deltaX;
        }

        if (offsetWidth !== (offsetWidth = target.offsetWidth)) {
            if (offsetWidth === undefined) {
                offsetWidth = memo.offsetWidth;
            }
        }

        if (offsetHeight !== (offsetHeight = target.offsetHeight)) {
            if (offsetHeight === undefined) {
                offsetHeight = memo.offsetHeight;
            }
        }

        if (!target.children[0]) {
            if (scrollWidth !== (scrollWidth = target.scrollWidth)) {
                if (scrollWidth === undefined) {
                    scrollWidth = memo.scrollWidth;
                }
            }
            if (scrollHeight !== (scrollHeight = target.scrollHeight)) {
                if (scrollHeight === undefined) {
                    scrollHeight = memo.scrollHeight;
                }
            }
        } else {
            target = target.children[0];
            if (scrollWidth !== (scrollWidth = target.offsetWidth)) {
                if (scrollWidth === undefined) {
                    scrollWidth = memo.scrollWidth;
                }
            }
            if (scrollHeight !== (scrollHeight = target.offsetHeight)) {
                if (scrollHeight === undefined) {
                    scrollHeight = memo.scrollHeight;
                }
            }
        }

        scrollTop = Math.max(0, Math.min(scrollTop, scrollHeight - offsetHeight));
        scrollLeft = Math.max(0, Math.min(scrollLeft, scrollWidth - offsetWidth));
    }

    return {
        scrollTop, scrollLeft,
        scrollWidth, scrollHeight,
        offsetWidth, offsetHeight,
    };
}
