import styles from './highlight.less';
import { Component } from 'reaxtor';

export class Highlight extends Component {
    loadProps(model) {
        return model
            .get(`highlight`)
            .defaultIfEmpty({ json: {} });
    }
    render(state) {
        return (
            <div id='highlighted-point-cont'
                 class_={{ [styles['highlighted-point-container']]: true }}>
                <div class_={{ [styles['highlighted-point']]: true }}>
                    <div class_={{ [styles['highlighted-point-center']]: true }}></div>
                </div>
            </div>
        );
    }
}
