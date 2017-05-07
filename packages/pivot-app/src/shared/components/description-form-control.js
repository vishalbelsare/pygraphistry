import { FormControl } from 'react-bootstrap';
import mapPropsStream from 'recompose/mapPropsStream';
import createEventHandler from 'recompose/createEventHandler';

const withDescription = mapPropsStream((props) => {
    const { handler: onChange, stream: changes } = createEventHandler();
    return props.switchMap(({ $falcor, ...props }) => {
        return changes
            .map(({ target }) => target.value)
            .debounceTime(200)
            .switchMap(
                (description) => $falcor.set({ json: { description }}).progressively(),
                (description, { json }) => ({ ...props, ...json, onChange })
            )
            .startWith({ ...props, onChange });
    });
});

const DescriptionFormControl = withDescription(({ description = '', onChange }) => (
    <FormControl placeholder=''
                 onChange={onChange}
                 componentClass='textarea'
                 defaultValue={description}
                 style={{resize: 'vertical'}}/>
));

export { withDescription, DescriptionFormControl };
