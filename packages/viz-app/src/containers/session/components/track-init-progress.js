import { Observable } from 'rxjs/Observable';
import { vboUpdates } from 'viz-app/client/legacy';
import shallowEqual from 'recompose/shallowEqual';
import mapPropsStream from 'recompose/mapPropsStream';
import { Col, Row, Grid, ProgressBar } from 'react-bootstrap';

function reload() {
  document.location.reload();
}

// latencyThreshold = show "herding stray GPUs" message
// latencyThreshold + refreshThreshold = show "something went wrong" message
export function TrackInitProgress(latencyThreshold = 22000, refreshThreshold = 38000) {
  return mapPropsStream(propsStream => {
    return propsStream
      .merge(
        vboUpdates
          .filter(update => update === 'received')
          .startWith(null)
          .mapTo({ message: null, progress: 100, status: 'default' })
      )
      .publish(propsStream => {
        return propsStream.timeout(latencyThreshold).catch(updateWithLatencyMessage);
        function updateWithLatencyMessage(error) {
          return propsStream
            .timeout(refreshThreshold)
            .catch(updateWithRefreshMessage)
            .startWith({
              progress: 100,
              status: 'default',
              message: `Herding stray GPUs`
            });
        }
        function updateWithRefreshMessage(error) {
          return Observable.of({
            status: 'danger',
            reload,
            progress: 100,
            message: `Something went wrong, click here to try again`
          });
        }
      })
      .scan((prev, curr) => ({ ...prev, ...curr }), {})
      .distinctUntilChanged(shallowEqual);
  });
}
