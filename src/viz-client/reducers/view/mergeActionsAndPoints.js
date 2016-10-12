import { Gestures } from 'rxjs-gestures';
import { Subject, Observable } from 'rxjs';

export function mergeActionsAndPoints(actions, name) {
    return actions.multicast(createSubject, (actions) => {
        const gesture = Gestures[name](actions.pluck('event'))
            .normalize()
            .preventDefault();
        return gesture.zip(actions, (point, action) => {
            for (const key in action) {
                if (key !== 'event') {
                    point[key] = action[key];
                }
            }
            point.buttons = action.event.buttons;
            return point;
        });
    });
}

function createSubject() {
    return new Subject();
}
