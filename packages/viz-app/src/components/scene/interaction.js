import labelStyles from '../labels/styles.less';
import { Observable, Scheduler, Subject } from 'rxjs';
const debug = require('debug')('graphistry:StreamGL:interaction');

/*
    shift left/right: rotate
    shift up/down: tilt
*/
// Camera -> Observable Camera
// feature-gated by 3d
export function setupRotate(target, camera) {
  var CODES = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40 };
  var AMT = 5;

  return Observable.fromEvent(target, 'keydown')
    .filter(function() {
      return camera.is3d;
    })
    .filter(function(e) {
      return !!e.shiftKey;
    })
    .do(function(e) {
      switch (e.keyCode || e.which) {
        case CODES.LEFT:
          camera.rotation.z = (camera.rotation.z + AMT) % 360;
          break;
        case CODES.UP:
          camera.rotation.x = (camera.rotation.x + AMT) % 360;
          break;
        case CODES.RIGHT:
          camera.rotation.z = (camera.rotation.z - AMT) % 360;
          break;
        case CODES.DOWN:
          camera.rotation.x = (camera.rotation.x - AMT) % 360;
          break;
      }
    })
    .mapTo(camera);
}

export function setupScroll(target, canvas, camera) {
  function hasClass(node, className) {
    return node.nodeType === 1 && node.classList && node.classList.contains(className);
  }

  function findNode(_node, className) {
    let node = _node;
    do {
      if (hasClass(node, className)) {
        return node;
      }
    } while ((node = node['parentNode']) && node.nodeType !== 9);
    return null;
  }

  function isSelectedLabelContents(_node) {
    let node = _node;
    return (node = findNode(node, labelStyles['label-contents'])) &&
      (node = findNode(node, labelStyles['label']))
      ? hasClass(node, labelStyles['clicked'])
      : false;
  }

  return Observable.fromEvent(target, 'wheel')
    .filter(({ target }) => !isSelectedLabelContents(target))
    .do(wheelEvent => wheelEvent.preventDefault())
    .map(event => {
      // Calculate the zoom factor as the log of the WheelEvent's deltaY
      // in whichever direction was scrolled. This yields a nice smooth
      // zoom acceleration gradient as the deltaY grows in size from 0.
      const { deltaY } = event;
      const zoomDirection = deltaY > 0 ? 1 : -1;
      // log(1) is 0, so take the max of either abs(deltaY) or 1, then add 1
      const zoomDelta = Math.max(Math.abs(deltaY), 1) + 1;
      const zoomFactor = zoomDirection * (Math.log(zoomDelta) / (160 / camera.pixelRatio));
      const screenPos = camera.canvas2ScreenCoords(event.clientX, event.clientY, canvas);
      debug('Mouse screen pos=(%f,%f)', screenPos.x, screenPos.y);
      return zoom(camera, 1 + zoomFactor, screenPos);
    });
}

export function setupZoomButton(toggleZoom, camera, zoomFactor) {
  return toggleZoom.map(() => zoom(camera, zoomFactor));
}

export function setupCenter(toggleCenter, curPoints, camera) {
  return toggleCenter.auditTime(0, Scheduler.animationFrame).switchMap(() => {
    debug('click on center');
    return curPoints.take(1).map(function(curPoints) {
      const points = new Float32Array(curPoints.buffer);
      // Don't attempt to center when nothing is on screen
      if (points.length < 1) {
        return camera;
      }
      const bbox = getBoundingBox(points);
      debug('Bounding box: ', bbox);
      const { top, left, right, bottom } = bbox;
      camera.centerOn(left, right, bottom * -1, top * -1);
      return camera;
    });
  });
}

// Camera * Float * {x : Float, y: Float}
// Zoom in/out on zoomPoint (specified in screen coordinates)
export function zoom(camera, zoomFactor, zoomPoint) {
  var xoffset = 0;
  var yoffset = 0;
  if (zoomPoint !== undefined) {
    xoffset = zoomPoint.x - camera.center.x;
    yoffset = zoomPoint.y - camera.center.y;
  }

  camera.center.x += xoffset * (1.0 - zoomFactor);
  camera.center.y += yoffset * (1.0 - zoomFactor);
  camera.zoom = camera.zoom * zoomFactor;
  camera.width = camera.width * zoomFactor;
  camera.height = camera.height * zoomFactor;

  debug(
    'New Camera center=(%f, %f) size=(%f , %f)',
    camera.center.x,
    camera.center.y,
    camera.width,
    camera.height
  );

  return camera;
}

export function getBoundingBox(points) {
  const len = points.length;

  let index = -2,
    top = Number.MAX_VALUE,
    left = Number.MAX_VALUE,
    right = Number.MIN_VALUE,
    bottom = Number.MIN_VALUE;

  while ((index += 2) < len) {
    const x = points[index];
    const y = points[index + 1];
    top = y < top ? y : top;
    left = x < left ? x : left;
    right = x > right ? x : right;
    bottom = y > bottom ? y : bottom;
  }

  if (len === 1) {
    top -= 0.1;
    left -= 0.1;
    right += 0.1;
    bottom += 0.1;
  }

  return { top, left, right, bottom };
}
