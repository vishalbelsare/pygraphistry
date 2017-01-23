import { Observable } from 'rxjs/Observable';
import * as Scheduler from 'rxjs/Scheduler/animationFrame';
import shallowEqual from 'recompose/shallowEqual';
import mapPropsStream from 'recompose/mapPropsStream';
import createEventHandler from 'recompose/createEventHandler';

function preventDefault(e) {
    e.preventDefault && e.preventDefault();
    e.stopImmediatePropagation && e.stopImmediatePropagation();
}

export const WithScrollPosition = mapPropsStream((props) => {

    const { stream: pages, handler: onPage } = createEventHandler();
    const { stream: wheels, handler: onWheel } = createEventHandler();
    const { stream: scrolls, handler: onScroll } = createEventHandler();

    const scrollPosition = scrolls
        .map(({ target }) => target)
        .auditTime(0, Scheduler.animationFrame)
        .merge(wheels.do(preventDefault))
        .merge(pages.withLatestFrom(props, (page, { height, rowHeight, rowHeaderHeight }) => ({
            scrollTop: page === 1 ? 0 : rowHeaderHeight + (page - 1) * (
                (rowHeight * /* rowsPerPage */ Math.floor(
                        (height - rowHeaderHeight) / rowHeight)))
        })))
        .startWith({ scrollTop: 0, scrollLeft: 0,
                     offsetWidth: 0, offsetHeight: 0,
                     scrollWidth: Infinity, scrollHeight: Infinity })
        .scan(scanScrollPosition)
        .distinctUntilChanged(shallowEqual);

    return props.combineLatest(scrollPosition, (props, { scrollLeft, scrollTop }) => ({
        ...props, onPage, onWheel, onScroll, scrollTop, scrollLeft
    }));
});

function scanScrollPosition(memo, eventOrTarget) {

    let { currentTarget: target } = eventOrTarget;
    let { scrollLeft, scrollTop,
          scrollWidth, scrollHeight,
          offsetWidth, offsetHeight } = memo;

    if (target === undefined) {
        target = eventOrTarget;
        scrollTop = target.scrollTop;
        if ((scrollLeft = target.scrollLeft) === undefined) {
            scrollLeft = memo.scrollLeft;
        }
    } else {
        scrollTop += eventOrTarget.deltaY;
        scrollLeft += eventOrTarget.deltaX;
    }

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

    scrollTop = Math.max(0, Math.min(scrollTop, scrollHeight - offsetHeight));
    scrollLeft = Math.max(0, Math.min(scrollLeft, scrollWidth - offsetWidth));

    return {
        scrollTop, scrollLeft,
        scrollWidth, scrollHeight,
        offsetWidth, offsetHeight
    };
}
