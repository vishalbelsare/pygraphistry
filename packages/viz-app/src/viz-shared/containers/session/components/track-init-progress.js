import mapPropsStream from 'recompose/mapPropsStream';
import { Col, Row, Grid, ProgressBar } from 'react-bootstrap';

export function TrackInitProgress(latencyThreshold = 8000, refreshThreshold = 12000) {
    return mapPropsStream((props) => {

        function reload() {
            document.location.reload();
        }

        return props.publish((props) => {

            return props
                .timeout(latencyThreshold)
                .catch(updateWithHighLatencyMessage);

                function updateWithHighLatencyMessage(error) {
                    return props
                        .timeout(refreshThreshold)
                        .catch(updateWithRefreshMessage)
                        .startWith({ message: `Herding stray GPUs` });
                }

                function updateWithRefreshMessage(error, props) {
                    return props.startWith({
                        status: 'warning', reload, progress: 100,
                        message: `Something went wrong, click here to try again`
                    });
                }
            })
            .scan((prev, curr) => ({ ...prev, ...curr }), {});
    });
}
