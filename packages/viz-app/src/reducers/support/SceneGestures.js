import { Gestures } from 'rxjs-gestures';
import { curPoints } from 'viz-app/client/legacy';
import { createSubject } from './createSubject';
import { ReplaySubject } from 'rxjs/ReplaySubject';
import { pointIndexesInRect } from './pointIndexesInRect';

function getReplaySubject1() {
  return new ReplaySubject(1);
}
function getIdentifier({ identifier = 'mouse' }) {
  return identifier;
}

export class SceneGestures extends Gestures {
  static startsByIdFromActions(actions) {
    return this.startFromActions(actions).groupBy(getIdentifier, null, null, getReplaySubject1);
  }
  static startFromActions(actions) {
    return SceneGestures.to(SceneGestures.start.bind(SceneGestures), actions);
  }
  static moveFromActions(actions) {
    return SceneGestures.to(SceneGestures.move.bind(SceneGestures), actions);
  }
  static endFromActions(actions) {
    return SceneGestures.to(SceneGestures.end.bind(SceneGestures), actions);
  }
  static cancelFromActions(actions) {
    return SceneGestures.to(SceneGestures.cancel.bind(SceneGestures), actions);
  }
  static tapFromActions(actions) {
    return SceneGestures.to(SceneGestures.tap.bind(SceneGestures), actions);
  }
  static pressFromActions(actions) {
    return SceneGestures.to(SceneGestures.press.bind(SceneGestures), actions);
  }
  static panFromActions(actions) {
    return SceneGestures.to(SceneGestures.pan.bind(SceneGestures), actions);
  }
  static to(gesture, actions) {
    return new this(
      actions.multicast(createSubject, actions =>
        gesture(actions.pluck('event'))
          .normalize()
          .withActions(actions)
      )
    );
  }
  lift(operator) {
    const observable = new SceneGestures(this);
    observable.operator = operator;
    return observable;
  }
  withActions(actions) {
    return this.zip(actions, (point, action) => {
      for (const key in action) {
        if (key !== 'event') {
          point[key] = action[key];
        }
      }
      point.buttons = action.event.buttons;
      return point;
    });
  }
  withPointIndexes() {
    return this.withLatestFrom(curPoints, (point, { buffer }) => {
      const { rect } = point;
      point.pointIndexes = !rect
        ? []
        : pointIndexesInRect(new Float32Array(buffer), rect.tl, rect.br);
      return point;
    });
  }
  mapToWorldCoords() {
    return this.map(point => {
      const {
        xOrigin,
        yOrigin,
        movementXTotal,
        movementYTotal,
        renderState: { camera, canvas }
      } = point;

      const { x: worldX, y: worldY } = camera.canvas2WorldCoords(
        xOrigin + movementXTotal,
        yOrigin + movementYTotal,
        canvas
      );

      const { x: worldXOrigin, y: worldYOrigin } = camera.canvas2WorldCoords(
        xOrigin,
        yOrigin,
        canvas
      );

      point.worldX = worldX;
      point.worldY = worldY;
      point.worldXOrigin = worldXOrigin;
      point.worldYOrigin = worldYOrigin;

      return point;
    });
  }
  dragRectInWorldCoords() {
    return this.map(point => {
      const {
        xOrigin,
        yOrigin,
        movementXTotal,
        movementYTotal,
        renderState: { camera, canvas }
      } = point;

      const rect = point.rect || (point.rect = {});

      rect.tl = camera.canvas2WorldCoords(
        Math.min(xOrigin, xOrigin + movementXTotal),
        Math.min(yOrigin, yOrigin + movementYTotal),
        canvas
      );

      rect.br = camera.canvas2WorldCoords(
        Math.max(xOrigin, xOrigin + movementXTotal),
        Math.max(yOrigin, yOrigin + movementYTotal),
        canvas
      );

      return point;
    });
  }
  moveRectInWorldCoords() {
    return this.map(point => {
      const { rect } = point;
      if (rect) {
        const { camera, movementX = 0, movementY = 0 } = point;
        const { width = 1, height = 1, simulationWidth = 1, simulationHeight = 1 } = camera;
        const { tl, br } = rect;
        tl.x += movementX * width / simulationWidth;
        tl.y -= movementY * height / simulationHeight;
        br.x += movementX * width / simulationWidth;
        br.y -= movementY * height / simulationHeight;
      }
      return point;
    });
  }
  moveCameraInWorldCoords() {
    return this.map(point => {
      const { camera } = point;
      if (camera) {
        const { movementX = 0, movementY = 0 } = point;
        const { center, width = 1, height = 1, simulationWidth = 1, simulationHeight = 1 } = camera;
        center.x -= movementX * width / simulationWidth;
        center.y -= movementY * height / simulationHeight;
      }
      return point;
    });
  }
}
