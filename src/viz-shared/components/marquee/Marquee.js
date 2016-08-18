import styles from './marquee.less';
import { Component } from 'reaxtor';
import { Gestures } from 'rxjs-gestures';
import { atom as $atom } from 'reaxtor-falcor-json-graph';
import { Observable, Scheduler, Subject } from 'rxjs';

export class Marquee extends Component {
    constructor(props) {
        super({ id: 'marquee', canDrag: false, ...props });
    }
    loadProps(model) {
        return model.get(
                ['scene', 'selection'],
                [['open', 'selection']],
            )
            .defaultIfEmpty({ json: {} });
    }
    loadState(model, { open = false, selection }) {

        if (!open) {
            return Observable.empty();
        }

        const { props: { canDrag }} = this;
        const hasActiveSelection = selection != null;

        const localModel = model.withoutDataSource();
        const marqueeClick = Observable.from(this.listen('marquee-click').clobber());
        const marqueeDrag = dragAsObservable(this.listen('marquee-down').clobber(),
                                             this.listen('marquee-move').clobber(),
                                             this.listen('marquee-up').clobber());

        const selectionDrag = !canDrag || !hasActiveSelection ?
            Observable.empty() :
            dragAsObservable(this.listen('selection-down').clobber(),
                             this.listen('selection-move').clobber(),
                             this.listen('selection-up').clobber())
                .map(({ x, y }) => ({
                    ...selection, ... {
                        x: x - (x - selection.x || 0),
                        y: y - (y - selection.y || 0)
                    }
                }))
                .do((rect) => console.log(JSON.stringify(rect)));

        const rects = !hasActiveSelection ? marqueeDrag : Observable.merge(
            marqueeDrag, selectionDrag//, marqueeClick.take(1).map(() => null)
        );

        return rects.multicast(() => new Subject(), (sels) => Observable.merge(
            // map each drag rect through to render
            sels.map((rect) => ({ selection: rect })),
            // write the last drag event to the model and map the result through to render
            sels.takeLast(1)
                .switchMap((rect) => localModel.set({ json: {
                    // If `canDrag` is false, reset the scene selection
                    // when the user stops dragging.
                    selection: $atom(canDrag ? rect : null),
                    scene: { selection: $atom(rect) }
                }}))
                .pluck('json')
        ))
        .repeat();
    }
    render(model, { open = false, selection }) {
        const { id } = this;
        const hasSelection = selection != null;
        const { x = 0, y = 0,
                w: width = 0,
                h: height = 0 } = (selection || {});
        return (
            <div id={id} class_={{
                     [styles['on']]: open,
                     [styles['off']]: !open,
                     [styles['marquee']]: true
                 }}
                 // on-click={this.dispatch('marquee-click')}
                 on-mouseup={this.dispatch('marquee-up')}
                 on-mousedown={this.dispatch('marquee-down')}
                 on-mousemove={this.dispatch('marquee-move')}>{
                    !hasSelection ? [] : [
                    <div class_={{ [styles['selection']]: true }}
                         style_={{
                             width: `${width}px`,
                             height: `${height}px`,
                             transform: `translate3d(${x}px, ${y}px, 0px)`
                         }}
                         on-mouseup={this.dispatch('selection-up')}
                         on-mousedown={this.dispatch('selection-down')}
                         on-mousemove={this.dispatch('selection-move')}>
                    </div>
            ]}</div>
        );
    }
}

function dragAsObservable(down, move, up) {
    return Observable.from(down.mergeMap((start) => {
        return move
            .startWith(start)
            .map(({ clientX, clientY }) => ({
                x: clientX, y: clientY,
                w: Math.abs(clientX - start.clientX),
                h: Math.abs(clientY - start.clientY),
                tr: {
                    x: Math.min(start.clientX, clientX),
                    y: Math.min(start.clientY, clientY),
                },
                origin: { x: start.clientX, y: start.clientY }
            }));
    }))
    .takeUntil(up);
}

/*
function dragAsObservable(down, move, up) {
    return Observable.from(down.mergeMap((start) => {
        return move
            .startWith(start)
            .map(({ clientX, clientY }) => ({
                x: Math.min(start.clientX, clientX),
                y: Math.min(start.clientY, clientY),
                w: Math.abs(clientX - start.clientX),
                h: Math.abs(clientY - start.clientY),
            }));
    }))
    .takeUntil(up);
}
*/
