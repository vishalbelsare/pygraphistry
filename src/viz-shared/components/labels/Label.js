import styles from './labels.less';
import { Component } from 'reaxtor';

export class Label extends Component {
    render({ title, columns }) {
        return (
            <div class_={{ [styles['label']]: true }}>
                <p>title: {title}</p>
                <ul>{columns.map(({ key, value, displayName, dataType }) => (
                    <li>
                        <p>key: {key}</p>
                        <p>value: {value}</p>
                        <p>displayName: {displayName}</p>
                        <p>dataType: {dataType}</p>
                    </li>
                ))}</ul>
            </div>
        );
    }
}
