import { Observable } from 'rxjs/Observable';
import { Button, ButtonGroup } from 'react-bootstrap';
import mapPropsStream from 'recompose/mapPropsStream';
import createEventHandler from 'recompose/createEventHandler';

function PD(e) {
  e && e.preventDefault && e.preventDefault();
}

const Paginate = mapPropsStream(props => {
  const { handler: onNext, stream: nexts } = createEventHandler();
  const { handler: onPrev, stream: prevs } = createEventHandler();
  const { handler: onLast, stream: lasts } = createEventHandler();
  const { handler: onFirst, stream: firsts } = createEventHandler();
  const { handler: onSelect, stream: selects } = createEventHandler();

  return props.switchMap(selectPage, (props, page) => ({
    ...props,
    page,
    onNext,
    onPrev,
    onLast,
    onFirst,
    onSelect
  }));

  function selectPage(props) {
    const { page = 1, pages = 1, boundaryLinks = false } = props;
    const events = selects.merge(
      (!boundaryLinks && Observable.empty()) ||
        Observable.merge(firsts.do(PD).mapTo({ to: 1 }), lasts.do(PD).mapTo({ to: pages }))
    );

    return events
      .merge(
        nexts
          .do(PD)
          .mapTo({ inc: 1 })
          .merge(prevs.do(PD).mapTo({ inc: -1 }))
      )
      .scan(
        (page, { inc, to }) => (!inc ? to || 1 : Math.max(1, Math.min(pages, page + inc))),
        page
      )
      .distinctUntilChanged()
      .do(props.onSelect)
      .startWith(page);
  }
});

function Pagination({
  page = 1,
  pages = 0,
  prev = false,
  next = false,
  size,
  buttonSize = 30,
  maxButtons = Infinity,
  vertical,
  ellipsis = false,
  boundaryLinks = false,
  onNext,
  onPrev,
  onLast,
  onFirst,
  onSelect,
  ...props
}) {
  const buttons = [];
  const numControls = prev + next + boundaryLinks * 2;
  const numButtons = Math.min(
    pages,
    typeof size === 'number'
      ? Math.min(maxButtons, Math.floor(size / buttonSize) - numControls - 1)
      : maxButtons
  );

  let endIndex,
    index,
    count = -1;

  index = Math.max(page - parseInt(numButtons * 0.5, 10), 1);

  const hasHiddenPagesAfter = numButtons < pages && pages >= numButtons + index;
  const hasHiddenPagesBefore = numButtons < pages && page - Math.round(numButtons * 0.5) > 1;

  if (hasHiddenPagesAfter) {
    endIndex = Math.min(pages, index + numButtons - 1);
  } else {
    endIndex = pages;
    index = Math.max(pages - numButtons + 1, 1);
  }

  do {
    ++count;

    const isFirstElement = count === 0 && numButtons > 4 && hasHiddenPagesBefore;
    const isLastElement = count === numButtons - 1 && numButtons > 4 && hasHiddenPagesAfter;
    const isEllipsisElement =
      ellipsis === true &&
      numButtons > 4 &&
      ((hasHiddenPagesBefore && count === 1) === true ||
        (hasHiddenPagesAfter && count === numButtons - 2) === true);

    const event = isLastElement
      ? { to: pages }
      : isFirstElement
        ? { to: 1 }
        : !isEllipsisElement ? { to: index } : { inc: (count === 1 ? -1 : 1) * (numButtons - 5) };

    buttons.push(
      <Button
        componentClass="a"
        key={`btn-${count}`}
        onClick={onSelect.bind(null, event)}
        bsStyle={(page === index && 'primary') || undefined}>
        {isEllipsisElement ? (
          <i className="fa fa-fw fa-ellipsis-h" />
        ) : isFirstElement ? (
          1
        ) : isLastElement ? (
          pages
        ) : (
          index
        )}
      </Button>
    );
  } while (++index <= endIndex);

  prev &&
    buttons.unshift(
      <Button key={`btn-prev`} onClick={onPrev} componentClass="a" disabled={page === 1}>
        <i className="fa fa-fw fa-angle-left" />
      </Button>
    );

  next &&
    buttons.push(
      <Button key={`btn-next`} onClick={onNext} componentClass="a" disabled={page === pages}>
        <i className="fa fa-fw fa-angle-right" />
      </Button>
    );

  if (boundaryLinks) {
    buttons.unshift(
      <Button
        key={`btn-first`}
        onClick={onFirst}
        componentClass="a"
        disabled={endIndex <= numButtons}>
        <i className="fa fa-fw fa-angle-double-left" />
      </Button>
    );

    buttons.push(
      <Button key={`btn-last`} onClick={onLast} componentClass="a" disabled={endIndex == pages}>
        <i className="fa fa-fw fa-angle-double-right" />
      </Button>
    );
  }

  props.vertical = vertical;
  props.justified = !vertical;

  if (typeof size === 'number') {
    props.style = { [vertical ? 'maxHeight' : 'maxWidth']: size, ...props.style };
  }

  props.style = { visibility: pages > 0 ? 'visible' : 'hidden', ...props.style };

  return <ButtonGroup {...props}>{buttons}</ButtonGroup>;
}

Pagination = Paginate(Pagination);

export default Pagination;
export { Pagination };
