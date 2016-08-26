import { Component } from 'reaxtor';

export class Investigation extends Component {
    loadProps(model) {
        return model.get(`['name']`);
    }

    render(model, { name }) {
        return (
                <option> {name} </option>
        );
    }
}
