import { Component } from 'reaxtor';

export class Investigation extends Component {
    loadProps(model) {
        return model.get(`['iname']`);
    }

    render(model, { iname }) {
        return (
                <span> {iname} </span>
        );
    }
}
