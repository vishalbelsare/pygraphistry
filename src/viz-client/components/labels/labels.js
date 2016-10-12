import React, { PropTypes } from 'react';
import {
    Subject, Observable,
    Subscription, ReplaySubject
} from 'rxjs';

import {
    compose,
    getContext,
    shallowEqual
} from 'recompose';

class Labels extends React.Component {
    render() {
        return (
            <div style={{
                width: `100%`,
                height: `100%`,
                position: `absolute`,
                background: `transparent`
            }}>
            </div>
        );
    }
}

Labels = getContext({
    renderState: PropTypes.object,
    renderingScheduler: PropTypes.object,
})(Labels);

export { Labels };
